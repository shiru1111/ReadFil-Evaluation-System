Pseudocode

BEGIN
// Step 1: Initialize the reading session
INPUT target_passage
INPUT audio_recording

// Step 2: Clean and tokenize the target passage
SET target_words = Clean_Text(target_passage)

// Step 3: Extract reading duration from audio
SET reading_time_seconds = Calculate_Audio_Duration(audio_recording)

// Step 4: Transcribe audio using the acoustic model (Wav2Vec2)
SET raw_spoken_text = Apply_Wav2Vec2_Transcription(audio_recording)
SET spoken_words = Clean_Text(raw_spoken_text)

// Step 5: Pre-process and Fix Segmentation Errors
// Iterates through spoken_words to fix STT grouping errors, synonyms, and enclitics
SET optimized_spoken = []
WHILE i < Length(spoken_words) DO
    SET current_word = spoken_words[i]
    
    IF current_word in SYNONYM_PAIRS AND Synonym exists in target_words THEN
        APPEND Synonym to optimized_spoken
    ELSE IF Phonetic_Match(current_word, target_words) THEN
        APPEND Matched_Target to optimized_spoken
    ELSE IF current_word is a Run-on of Multiple Target Words THEN
        APPEND Split_Target_Words to optimized_spoken
    ELSE IF current_word ends with 'y' AND Base exists in target_words THEN
        APPEND Base and 'ay' to optimized_spoken
    ELSE IF (current_word + next_word) is in target_words OR phonetically matches THEN
        APPEND Fused_Word to optimized_spoken
        SKIP next_word
    ELSE IF (current_word + next_word with overlap) is in target_words OR phonetically matches THEN
        APPEND Overlap_Fused_Word to optimized_spoken
        SKIP next_word
    ELSE IF current_word has particle prefix (e.g., 'at') AND remainder is in target_words THEN
        APPEND Particle and Remainder to optimized_spoken
    ELSE
        APPEND current_word to optimized_spoken
    END IF
    
    INCREMENT i
END WHILE

// Step 6: Align Target Words and Optimized Spoken Words
SET aligned_sequence = Apply_Needleman_Wunsch_Alignment(target_words, optimized_spoken)

// Step 7: Score Aligned Sequence (Phonetic Evaluation)
SET total_correct = 0
SET total_errors = 0
SET trace_results = []

FOR EACH (target_word, spoken_word) IN aligned_sequence DO
    IF target_word is GAP THEN
        total_errors += 1
        APPEND (Insertion Error) to trace_results
    ELSE IF spoken_word is GAP THEN
        total_errors += 1
        APPEND (Omission Error) to trace_results
    ELSE
        IF target_word == spoken_word THEN
            total_correct += 1
            APPEND (Pass - Exact) to trace_results
        ELSE IF is_correct_pronunciation(target_word, spoken_word) THEN
            total_correct += 1
            APPEND (Pass - Phonetic Match) to trace_results
        ELSE
            SET mld_score = modified_levenshtein(target_word, spoken_word)
            IF mld_score <= 1.0 THEN
                total_correct += 1
                APPEND (Pass - Minor Mispronunciation) to trace_results
            ELSE
                total_errors += 1
                APPEND (Fail - Substitution/Mispronunciation) to trace_results
            END IF
        END IF
    END IF
END FOR

// Step 8: Compute Final Metrics
SET total_target_words = Length(target_words)
SET accuracy_rate = (total_correct / total_target_words) * 100
SET accuracy_rate = MAX(accuracy_rate, 0) // Ensure accuracy does not drop below 0%

SET duration_minutes = reading_time_seconds / 60
SET wcpm_score = total_correct / duration_minutes

// Step 9: Return structured evaluation results
OUTPUT accuracy_rate, wcpm_score, trace_results
END
