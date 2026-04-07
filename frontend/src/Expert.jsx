import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const allPassages = [
  // Bulalakaw ng Pag-Asa
  { text: "Walang tugot ng katatakbo ang dalawang magkatoto. Lumalaon ay lumalaki ang pagitan nila at ng sasakyan. Sasabihin ng mga pusong mahihina, na sila'y wala nang pag-asa. Datapuwa't di gayon. Sa mga kawal na iyon ng kabayanihan, ang pag-asa sa isang pagwawagi ay lalong kumikinang at nagbabaga habang napapabingit sa panganib, pagkasawi at kamatayan.", source: "Bulalakaw ng Pag-Asa ni Ismael A. Amado" },
  { text: "Dapat munang unawain na ang bahay nina Pepe na kanilang pinanggalingan ay nag-iisang nakatayo sa labas ng bayan ng Libis, sa tabi ng isang mahabang daan na patungo sa Maynila. Mula sa bahay na iyon, ang isang maglalakbay sa Maynila ay kailangang lumakad ng mga isang oras bago dumating sa kapwa bahay. Ang daang ito na patungo sa Maynila, ay siyang tinatalaktak nina Gerardo.", source: "Bulalakaw ng Pag-Asa ni Ismael A. Amado" },
  { text: "Kalahating oras na silang naglalakad ngunit di pa tumitigil. Naiinip na si Gerardo, datapuwa't gayon na lang yata ang kagandahan ng kanyang ugali na kahit ang isang pagkainip ay ayaw ipahalata kahit sa isang demonyo. Bukod sa rito'y talaga namang natigasan niya ang pakikipagtagalan sa kanyang kasama saan man siya dalhin palibhasa't malaki ang nais niyang mabatid kung tunay ngang matutupad ang mga sumbat sa kanya na natatala sa tinanggap na liham.", source: "Bulalakaw ng Pag-Asa ni Ismael A. Amado" },
  { text: "Di nalaon at sila'y sumapit sa isang ilang, na dahil sa kasukalan, ay matatawag nang gubat. Isang bahagi ng ilang na ito ay pinangingilagang lubha ng mga matatakuting taga-Libis tulad ng pangingilag nila sa isang libingan. Di umano'y may mga lungga doon ang mga aswang. Di umano'y ang mangahas na maglagalag doon sa kalaliman ng gabi ay nawawala't sukat. May mga baboy daw na sungayan, mga kalabaw na parang baga ang mga mata, at mga asong singlalaki ng kabayo, na paraparang nanghaharang doon.", source: "Bulalakaw ng Pag-Asa ni Ismael A. Amado" },
  { text: "Kaginsaginsa'y naulinigan nila mula sa malayo ang isang sasakyang humahagunot. Lumalaon ay lumalakas, sa kanilang pakinig, ang kalugkog ng mga gulong at lumalaon ay tumitingkad, sa kanilang paningin, ang dalawang ilaw ng sasakyan. Di nagtagal at nalapit ang kalesa sa magkaibigan.", source: "Bulalakaw ng Pag-Asa ni Ismael A. Amado" },
  { text: "Lahat ay galak na galak lubha na ang mga binata. Walang labi na di nakangiti, walang matang di nagniningning, walang kilos na mabagal. At sino nga naman ang di magagalak, aling puso ang di lalakasan ng tibok, kaninong damdamin ang di mapupukaw sa lilim ng mapanghalina't malalagkit na titig.", source: "Bulalakaw ng Pag-Asa ni Ismael A. Amado" },
  { text: "Walang ano-ano'y lumapit sa isang mesa at umupo. Pinag-abot ang mga kilay na pumapalamuti sa mga naglalalimang mata na nagpapahiwatig ng tatlong gabing di pagkatulog, sinabunot ang mga mapuputi niyang buhok, tiningala ang isang larawang nakasabit sa dinding, kinagat ang labi, nagbuntong-hininga, sumuntok ng buong diin, pumadyak, tumindig at nagyaot dito na naman.", source: "Bulalakaw ng Pag-Asa ni Ismael A. Amado" },

  // Florante at Laura
  { text: "Isang pasasalamat ni Francisco sa sino mang babasa ng tula at magpapahalaga nito. Hinihiling niyang subukang unawain ang malalim na wikang ginamit dito dahil kung susuriin ng husto ay malalamang ito ay malinaw at wasto.", source: "Florante at Laura ni Francisco Balagtas" },
  { text: "Isang binatang nakagapos sa isang puno ng higera sa gitna ng malawak na gubat sa labas ng kahariang Albanya. Ang binatang ito ay si Florante. Tiyak na kamatayan ang kinabibingitan ng kanyang buhay sa dahilang hindi niya maipagtanggol ang kanyang sarili.", source: "Florante at Laura ni Francisco Balagtas" },
  { text: "Sinabi ni Florante sa kanyang sarili na kaya niyang tiisin ang pagdurusa, kung ito ang gustong mangyari ng Maykapal. Iisa lamang ang tangi niyang hiling, ang maalala siya ng kanyang minamahal na si Laura. Di niya maiwasang maalala ang kanilang suyuan, at iniisip niya na baka agawin si Laura ng kanyang karibal na si Adolfo.", source: "Florante at Laura ni Francisco Balagtas" },
  { text: "Tanging hiling ni Florante ay makita muli si Laura at siya'y arugain at damayan sa kanyang mga sakit tulad ng nakaraan. Halos sumuko ang puso ni Florante sa dahas ng panibugho lalo na kung naguguniguni niya na si Laura ay humilig na sa kandungan ni Konde Adolfo. Para kay Florante ay matamis pa ang mamatay kaysa makita niyang si Laura ay nasa ibang kamay.", source: "Florante at Laura ni Francisco Balagtas" },
  { text: "Sa pagkakataong iyon, nagpaalam na si Florante sa Albanya, na puno na ngayon ng kasamaan at kanyang minamahal na si Laura. Wala siyang naisip kundi ipagtanggol ang kanyang bayan subalit di niya inaasahang ganoon na lamang ang kahihinatnan ng kanyang pagsasakripisyo sa bansa dahil ipapakain lang pala siya sa dalawang leon.", source: "Florante at Laura ni Francisco Balagtas" },
  { text: "Mabuti na lamang at sa kaliksihan ni Menandro ay napailandang ang espada ni Adolfo at ang kataksilan niya'y nabigo. Kinabukasan ay lumisan sa Atenas at umuwi sa Albanya ang napahiyang si Adolfo. May hangad pala itong maagaw si Laura kay Florante na siyang iniibig ng dalaga upang maging hari kung maging reyna na si Prinsesa Laura, sakaling yumao o mamatay si Haring Linseo.", source: "Florante at Laura ni Francisco Balagtas" },
  { text: "Namalagi pa si Florante ng isang taon sa Atenas hanggang tumanggap siya ng isang liham mula sa Albanya. Ibinalita ng kanyang ama na pumanaw na ang kanyang ina. Laking sama ng loob ang idinulot nito kay Florante.", source: "Florante at Laura ni Francisco Balagtas" },
  { text: "Pagkaraan pa nang dalawang buwan, may sasakyang lumunsad sa pantalan ng Atenas na may pahatid-liham mula sa ama ni Florante na nagsasabing siya daw ay umuwi agad sa kanyang bayang Albanya. Nagpaalam siya sa kanyang gurong si Antenor at ito nama'y nagpaalalang siya'y mag-ingat sa banta sa kanyang buhay.", source: "Florante at Laura ni Francisco Balagtas" },
  { text: "May anim na taon na siyang naglalagalag sa iba't ibang lugar. Hanggang sa masapit ang gubat na kinasasapitan ni Florante at siya'y iniligtas sa dalawang leon na sa kanya'y sasagpang. Sa kanilang paglalakad papalabas ng gubat ay may nadinig silang dalawang tinig ng babaeng nagsasalaysay.", source: "Florante at Laura ni Francisco Balagtas" },
  { text: "Nagsigawan sa tuwa ang hukbo nang makitang buhay si Florante at Laura. Nagsibalik ang lahat sa palasyo. Hindi nagtagal at nakasal ang dalawa at naging hari at reyna ng Albanya.", source: "Florante at Laura ni Francisco Balagtas" },

  // Ibong Adarna
  { text: "Isang engkantadong ibon. Ito ay nagpapahinga sa punong may mga pilak na dahon kung sumasapit ang hatinggabi. Umaawit ito ng pitong beses at sa bawat awit nito ay nag-iiba ng anyo ang kanyang mga plumahe.", source: "Ibong Adarna" },
  { text: "Kinikilalang isang haring makatarungan at makatuwiran. Hinahangaan nang labis ang kanyang mahusay na pamamahala sa Berbanya dahil sa payapang namumuhay ang mga mamamayan sa maunlad na kaharian.", source: "Ibong Adarna" },
  { text: "Ang panganay na anak ng Hari at Reyna ng Berbanya. Isa siyang magiting na mandirigma. Likas ang angking galing at talino na taglay ng isang prinsipeng tagapagmana ng korona, subalit likas din ang kanyang angking kabuktutan at ang lihim na inggit.", source: "Ibong Adarna" },
  { text: "Ang mahiwagang huni ng nasabing ibon ang makapagpapagaling lamang umano sa sakit ng hari. Sumapit na sila sa takdang gulang at dumaan sa mga pagsasanay sa pananandata, gaya ng inaasahan sa sinumang prinsipe.", source: "Ibong Adarna" },
  { text: "Sa Bundok ng Enkantadong Tabor ay namumugad ang Ibong Adarna, kung sino sa anak ng hari ang makakahuli at magdadala nito sa hari ay siya ang kaniyang pipiliin. Sa sandaling madala na ang ibon at marinig itong umawit, ang hari ay gagaling. Isinalaysay ng hari kay Reyna Valeriana ang panaginip na dumalaw sa kanya.", source: "Ibong Adarna" },
  { text: "Dahil hanggang ngayo'y hindi pa napagpasiyahan ng hari kung sino ang magiging tagapagmana ng kaharian. Ang kaniyang karamdaman ay ibinigay sa hari upang matulungan siyang magpasiya. Kung sinuman sa mga anak ng hari ang makakapagpagaling ay siyang karapat-dapat na maging tagapagmana ng setro at korona.", source: "Ibong Adarna" },
  { text: "At ang mga na-engkantong mga prinsipe, kabalyero at konde ay inalisan na ni Donya Maria ng sumpa. At ang lihim na pinaka-iingatan ng mga magulang ni Donya Maria ay kanya ring inilantad na. Nagbalik sa pagiging leon at tigre ang mga utusan at nagsilantaran ang mga tunay na tao na nagtatagong kasangkapan sa loob ng palasyo.", source: "Ibong Adarna" },

  // El Filibusterismo
  { text: "Yumaman ito dahil sa tiyaga. Nakisama muna sa isang namumuhunan sa bukid. Nang makaipon ng kaunti ay naghawaan ng gubat na nang ipagtanong niya ay walang may-ari, at ginawa niyang tubuhan.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Malaki ang natutunan ni Basilio. Nagsulit siya sa pagkabatsilyer. Ipinagmamalaki siya ng kanyang mga profesor. Nakasulit siya at kumuha ng medisina. Pagkatapos, naging matiyaga at masigasig sa pag-aaral si Basilio. Kaya di pa man nakakatapos ay nakapanggamot na siya.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Ngunit sinuwatan niya sina Basilio at mga kasamahan na nagbabalak magtayo ng paaralan ng Wikang Kastila at humihinging gawing lalawigan ng Espanya ang Pilipinas at bigyan ng pantay na karapatan ang mga Kastila at Pilipino. Ito raw ay magbibigay daan sa Pilipinas sa pagiging bayang walang sariling pagkukuro, walang kalayaan at pati kapintasan ay hiram dahil sa pagpipilit manghiram ng wika.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Iilan lamang daw ang nakapagsasalita ng Kastila. At ang iilang ito ay mawawalan ng sariling kakayahan, magpapailalim sa ibang utak, paaalipin. Tinuligsa rin niya ang mga nagpapanggap na di sila maalam magsalita at umunawa ng sariling wika.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Samantalang nagsusugal ay pinag-aralan at pinasyahan ng Kapitan ang mga papeles ng pamamahala na inisa-isa ng kalihim pagpapalit ng tungkulin, pagbibigay ng biyaya, pagpapatapon at iba pa. Saka na ang ukol sa paaralan ng Kastila.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Walang panahong basahin ang kasulatan. Nalaala niya ang isang amain na nawalan ng mga pag-aari nang lumagda sa isang kasulatang di binasa. Ngunit sa matagal na pagpipilitan ay nahuli sa klase si Placido Petinente. Pinatunog pa ang takong ng sapatos. Inakala niyang ang pagkakahuli niya ay pagkakataon na upang siya'y mapuna at makilala ng kanyang guro.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Ayon pa sa kanya, hindi binili ng mga kapitan ang kanyang pinabibili at sa halip ay mga paputok at kuwitis ang kanilang binili at binayaran ang bawat dupikal ng kampana, gayong sa agham ay mapanganib ang tugtog ng mga batingaw kapag kumukulog.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Unang tinanong sa klase ang isang antukin. Parang ponograpo itong tumugon ng isang isinaulong leksiyon na ukol sa salamin, bahagi nito, kauriang bubog o kalaing. Pinatigil ng guro ang estudyante. Pinilosopiya ang musika.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Di tinugon ng estudyante ang tanong. Ipinagpatuloy ang isinaulong aralin na parang plakang natigil at muling pinaandar sa ponograpo. Pinatigil uli ang estudyante, muling tinanong sa sampay bakod na Kastila.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Malaki ang bahay na tinitirahan ng estudyanteng si Makaraig. Maluwag ang bahay na ito at puro binata ang nakatira na pawang nangangasera. Iba-iba ang kanilang edad at pag-uugali.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Ngunit nabigo siya dahil nagpasiya ang abogado na huwag makialam dahil maselan ang usapan. Marami na siyang pag-aari kaya't kailangang kumilos nang ayon sa batas. Ang ganting katwiran ni Isagani ay lubos na hinangaan ng abogado dahil sa katalinuhan at katayugan ng pag-iisip nito.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Ang kahon ay may lamang abo at kapirasong papiro na kinasusulatan ng dalawang salita. Sa pamamagitan ng pagbigkas ng unang salita ang abo ay nabubuhay at nakakausap ang isang ulo at pagbanggit ng ikalawang salita ito ay babalik sa dating kinalalagyan nito.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Siya ay nakapag-asawa ng isang mayaman at sa pamamagitan ng yaman ng asawa, nakapagnegosyo siya kahit kulang sa kaalaman sa mga tungkuling kanyang hinahawakan siya ay pinupuri dahil siya ay masipag. Nang bumalik siya sa Espanya walang pumansin sa kanya dahil sa kakulangan niya sa pinag-aralan, kaya wala pang isang taon nagbalik na siya sa Pilipinas at nagmagaling sa mga Pilipino sa kanyang kunwaring magandang karanasan sa Madrid.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Lumagay siya parang amo't tagapagtanggol, ngunit siya'y naniniwalang may ipinanganak upang mag-utos at ang iba'y upang sumunod. Ang Pilipino'y ipinanganak upang maging utusan, kaya't kailangang pagsabihang lagi na ang mga ito'y sa gayon lamang ukol.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Ang palabas ay humati sa Maynila. Mayroong nagsitutol dito bilang masagwa at laban sa moralidad, tulad nina Don Custodio at ng mga prayle. Mayroon namang nagtanggol dito. Mga pinuno ng hukbo at mga marino, ang kawani, at maraming matataas na tao. Laban ang mga babaing may asawa o may kasintahan. Ang wala nama'y sang-ayon sa opera.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Lampas na sa oras ay di pa nagsisimula ang palabas dahil wala pa ang Kapitan Heneral. May nagsisipadyak ng baston at sumisigaw na buksan na ang tabing. Maraming pabastos na paghanga sa mga babae na maririnig sa mga artilyero. Maraming tsismisan. Mausok. Maraming pagtatalo.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Pinag-aralang mabuti ang pagpapagaling kay Kapitan Tiyago na noon ay lalong naging mahirap pakibagayan. Kung minsan ay mahal na mahal nito si Basilio at kung minsa'y nilalait. Pabigat nang pabigat ang karamdaman nito.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Nangiti na rin ang binata at napawi ang lahat ng kanyang mga hinanakit sa dalaga. Nalubos na sana ang kanyang tuwa nang itanong sa kanya ni Donya Victorina kung bakit ang binata ang pinaghahanap na asawang Kastila.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "May nagpanukalang magpabaril kaagad ng isang dosenang pilibusterilyo upang matigil ang gulo. Anang isa'y sapat nang palakarin sa mga lansangan ang mga kawal na kabayuhan at may hilang kanyon at ang lahat ay magsisipanhik ng bahay upang manahimik.", source: "El Filibusterismo ni Dr. José Rizal" },
  { text: "Mabuting bata raw at matatapos na ng panggagamot. Lalong napahamak si Basilio dahil lahat ng sabihin ng Kawani ay tinututulan ng Heneral. At kailangan daw magkaroon ng halimbawang di dapat tularan ang mga mahilig sa pagbabago.", source: "El Filibusterismo ni Dr. José Rizal" },

  // Noli Me Tangere
  { text: "Ang pagkakapatingin niya sa Bagumbayan ay nagpabangon sa bilin ng kanyang naging gurong pari bago siya tumulak sa ibang bansa. Ang bilin ng Pari ay ang karunungan ay para sa tao, ngunit ito ay natatamo lamang ng mga may puso lamang.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Kailangang pagyamanin ang karunungan upang maisalin ito sa mga susunod na salin-lahi at ang mga dayuhan ay nagpunta sa Pilipinas upang humanap ng ginto. Kung kaya't nararapat lamang na puntahan ang lugar ng mga dayuhan upang kunin naman ni Ibarra ang ginto nila.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Nakita din niya ang mga magagandang karwahe na ang mga sakay ay mga kawaning inaantok pa sa kanilang mga pagpasok sa mga tanggapan at pagawaan, mga Tsino at paring walang kibo.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Sa paniniwala ng may sakit na pari, dahan-dahan ng nawawala ang kanilang mga kayamanan lalo na sa Europa dahil sa pagtaas ng buwis na nagiging dahilan ng pagkawala ng kanilang mga ari-arian.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Lumabas ng simbahan si Tasyo at nagtuloy sa may kabayanan. Nagtuloy siya sa bahay ng mag-asawang Don Filipo at Aling Doray. Masayang sinalubong ng mag-asawa at itinanong kung nakita niya si Ibarra na nagtungo sa libingan.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Bagama't may hidwaan ang Alperes at Pari Salvi kapag sila ay nagkikita ay pareho silang nagpaplastikan. Sila ay nagbabatian sa harap ng maraming tao at parang walang anumang namamagitan di pagkakaunawaan. Pero, kapag hindi na magkaharap gumagawa sila ng kani-kanilang mga paraan para makapaghiganti sa isa't isa.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Sa ibang bahagi ng libingan, may dalawang tao ang humuhukay ng paglilibingan na malapit sa pader na parang babagsak na. Ang isa ay dating sepulturero at ang isa naman ay parang bago sapagkat hindi siya mapakali, dura ng dura sa lupa at panay ang hitit ng sigarilyo.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Isa pa, gusto ng kanyang ina na siya ay magpare. Pero, hindi niya ito sinunod at sa halip ay nag-asawa na lamang siya. Gayunman, pagkaraan ng isang taon, namatay ang kanyang asawa.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Nagkaroon siya ng malungkot na pangitain. Kasalukuyan siyang dumadalangin sa Mahal na Birhen, nang gulantangin siya ng malakas na tawag ni Basilio mula sa labas ng bahay.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Higit sa lahat, nagsaing siya ng puting bigas na sadyang inani niya sa bukid. Ang ganitong hapunan ay tunay na pangkura, na gaya ng sinabi ni Pilosopo Tasyo kina Basilio at Crispin ng puntahan niya ang mga ito sa simbahan.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Sa kasamaang palad, hindi natikman ng magkapatid ang inihanda ng ina sapagkat dumating ang kanilang ama. Nilantakang lahat ang mga pagkaing nakasadya sa kanila. Itinanong pa niya kung nasaan ang dalawa niyang anak.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Malaki ring problema anya, ang kawalan ng pagtutulungan ng mga magulang at mga taong nasa pamahalaan. Lumilitaw na hindi ang lahat ng mga pangangailangan ng mga batang nag-aaral na katulad ng mga libro na karaniwang nasusulat sa wikang Kastila at ang pagmememorya ng mga bata sa mga nilalaman nito.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Nawalang saysay din ang panukala ng Kabesa sapagkat ipinahayag ng Kapitan na tapos na ang pasya ng Kura na tungkol sa pista. Ang pasya ng Kura ay ang pagdaraos ng anim na prusisyon, tatlong sermon, tatlong misa mayor at komedya sa Tundo.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Muling nagsumamo si Sisa, pero mistulang bingi ang kanyang mga kausap. Ipinakiusap ni Sisa na payagan siyang mauna ng ilang hakbang sa nga Sibil habang sila ay naglalakad patungong kuwartel kapag sila ay nasa kabayanan na.", source: "Noli Me Tangere ni Dr. José Rizal" },
  { text: "Ipinakiusap ni Maria sa kasintahan na huwag nang isama ang Kura sa lakad nila sapagkat magmula ng dumating siya sa bayan nilulukob siya ng pagkatakot sa tuwing makakaharap niya ang Kura.", source: "Noli Me Tangere ni Dr. José Rizal" }
];

export default function Expert() {
  const navigate = useNavigate();

  const [isTestReady, setIsTestReady] = useState(() => {
    return localStorage.getItem('expert_isTestReady') === 'true';
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = localStorage.getItem('expert_currentIndex');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [testPassages, setTestPassages] = useState(() => {
    const saved = localStorage.getItem('expert_passages');
    return saved ? JSON.parse(saved) : [];
  });

  // Updated Mic Test States
  const [micStatus, setMicStatus] = useState('idle'); // idle, recording_test, playback_ready
  const [testAudioUrl, setTestAudioUrl] = useState(null);

  // Actual Test States
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Refs for the ACTUAL evaluation recording
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Refs for the MIC TEST phase
  const testRecorderRef = useRef(null);
  const testChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (testPassages.length === 0) {
      const shuffled = [...allPassages];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, 25);
      setTestPassages(selected);
      localStorage.setItem('expert_passages', JSON.stringify(selected));
    }
  }, [testPassages.length]);

  useEffect(() => {
    localStorage.setItem('expert_currentIndex', currentIndex.toString());
  }, [currentIndex]);

  // Clean up media tracks and animations when component unmounts
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);
  // --- UPDATED: Continuous Live Timer Logic ---
  useEffect(() => {
    let timer;
    if (isTestReady) {
      timer = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [isTestReady]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- Visualizer Logic ---
  const drawWaveform = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#f9fafb'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#005FA3'; // Dark blue theme for Expert level
      ctx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  };

  // --- Mic Test Logic ---
  const handleMicTestToggle = async () => {
    if (micStatus === 'idle' || micStatus === 'playback_ready') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 2048;

        testRecorderRef.current = new MediaRecorder(stream);
        testChunksRef.current = [];
        
        testRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) testChunksRef.current.push(event.data);
        };

        testRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(testChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          setTestAudioUrl(audioUrl);
        };

        testRecorderRef.current.start();
        setMicStatus('recording_test');
        drawWaveform();

      } catch (err) {
        console.error("Microphone access denied:", err);
        alert("Please allow microphone permissions in your browser to proceed.");
      }
    } else if (micStatus === 'recording_test') {
      testRecorderRef.current.stop();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setMicStatus('playback_ready');
    }
  };

  // --- Actual Evaluation Logic ---
const sendAudioToServer = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'latest_recording.webm');
    
    // Add the target passage text to the payload
    const targetText = testPassages[currentIndex]?.text || "";
    formData.append('target_text', targetText);

    try {
      const response = await fetch('http://127.0.0.1:5000/api/evaluate', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      console.log("Server Evaluation Results:", result);

      localStorage.setItem('final_accuracy', result.accuracy_rate);
      localStorage.setItem('final_wcpm', result.wcpm);
      
      // You can later save these results to state/localStorage to display on Results.jsx
    } catch (error) {
      console.error("Error sending audio to server:", error);
    }
    audioChunksRef.current = [];
  };

  const startActualTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = sendAudioToServer;
      
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      
      setIsTestReady(true);
      localStorage.setItem('expert_isTestReady', 'true');
    } catch (err) {
      alert("Microphone connection lost. Please allow access.");
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setHasRecorded(true);
    } else {
      audioChunksRef.current = [];
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setHasRecorded(false);
    }
  };

  const handleReturnHomeClick = (e) => {
    e.preventDefault();
    setShowConfirmModal(true);
  };

  const confirmReturnHome = () => {
    localStorage.removeItem('expert_passages');
    localStorage.removeItem('expert_currentIndex');
    localStorage.removeItem('expert_isTestReady');
    navigate('/');
  };
  
  const nextPassage = () => {
    if (currentIndex < testPassages.length - 1) {
      setCurrentIndex((prevIndex) => prevIndex + 1);
      setIsRecording(false); 
      setHasRecorded(false);
    } else {
      localStorage.removeItem('expert_passages');
      localStorage.removeItem('expert_currentIndex');
      localStorage.removeItem('expert_isTestReady');
      navigate('/results');
    }
  };

  if (testPassages.length === 0) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#005FA3]/5 to-white text-black font-sans relative">
      <nav className="w-full bg-white/80 backdrop-blur-md shadow-sm px-10 lg:px-20 py-5 flex justify-between items-center">
        <div className="text-2xl font-black tracking-tight text-[#005FA3]">ReadFil</div>
        <a href="/" onClick={handleReturnHomeClick} className="font-semibold text-sm uppercase tracking-wide hover:text-[#005FA3] transition-colors cursor-pointer">
          Return Home
        </a>
      </nav>

      {!isTestReady ? (
        <main className="max-w-3xl mx-auto pt-32 px-10 pb-20 text-center">
          <h1 className="text-4xl font-extrabold mb-4 text-[#005FA3]">Expert Microphone Check</h1>
          <p className="text-gray-600 text-lg mb-12">Final audio verification for the Expert Level.</p>
          
          <div className="bg-white p-10 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col items-center">
            
            {/* Visualizer Canvas */}
            <div className="w-full h-32 bg-gray-50 rounded-xl border border-gray-200 mb-8 overflow-hidden flex items-center justify-center">
              {micStatus === 'idle' && <p className="text-gray-400 font-medium">Waveform will appear here</p>}
              <canvas 
                ref={canvasRef} 
                width="600" 
                height="128" 
                className={`w-full h-full ${micStatus === 'idle' ? 'hidden' : 'block'}`}
              />
            </div>

            <p className="text-xl font-medium text-gray-700 mb-8">
              {micStatus === 'idle' ? 'Click the mic to record a test phrase.' : 
               micStatus === 'recording_test' ? 'Recording... Speak clearly, then click to stop.' : 
               'Test complete! Listen to your playback.'}
            </p>

            {/* Test Controls */}
            <div className="flex flex-col items-center gap-6">
              {micStatus !== 'playback_ready' ? (
                <button 
                  onClick={handleMicTestToggle}
                  className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transform transition-all ${
                    micStatus === 'recording_test' ? 'bg-red-600 hover:bg-red-700 animate-pulse scale-110' : 'bg-[#005FA3] hover:bg-[#004A80] hover:scale-105'
                  }`}
                >
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {micStatus === 'recording_test' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                    )}
                  </svg>
                </button>
              ) : (
                <div className="flex flex-col items-center gap-6 w-full">
                  <audio src={testAudioUrl} controls className="w-full max-w-md" />
                  <div className="flex gap-4">
                    <button 
                      onClick={() => { setMicStatus('idle'); setTestAudioUrl(null); }}
                      className="px-6 py-3 rounded-full font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      Retest Mic
                    </button>
                    <button 
                      onClick={startActualTest}
                      className="bg-[#005FA3] hover:bg-[#004A80] text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all transform hover:-translate-y-1"
                    >
                      Start Expert Evaluation
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
      ) : (
        <main className="max-w-4xl mx-auto pt-20 px-10 pb-20">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-extrabold mb-4 text-[#005FA3]">Expert Level</h1>
            <p className="text-gray-600 text-lg">Focus on articulation and correct vowel pronunciation.</p>
          </div>
<div className="bg-white p-10 rounded-[2rem] shadow-xl border border-gray-100 mb-10 relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#0096FF]">Reading Material</h2>
              <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                {currentIndex + 1} / {testPassages.length}
              </span>
            </div>
            
            <div className="p-8 pb-12 bg-gray-50 rounded-xl border border-gray-200 min-h-[150px] flex flex-col items-center justify-center relative">
              <p className="text-2xl leading-relaxed text-center font-medium text-black">
                "{testPassages[currentIndex]?.text}"
              </p>
              <span className="mt-6 text-sm text-gray-400 italic">
                Source: {testPassages[currentIndex]?.source}
              </span>

              {/* NEW: Live Timer */}
              <div className="absolute bottom-4 right-6 flex items-center gap-2 text-gray-600 font-mono font-bold bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                {formatTime(elapsedTime)}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <button onClick={toggleRecording} className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-[#005FA3] hover:bg-[#004A80]'}`}>
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isRecording ? (
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                ) : (
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                )}
              </svg>
            </button>
            <p className={`mt-6 font-bold text-lg ${isRecording ? 'text-red-600' : 'text-gray-500'}`}>{isRecording ? 'Recording Expert Audio...' : hasRecorded ? 'Recording sent to server!' : 'Click to begin'}</p>
            {hasRecorded && (
              <button onClick={nextPassage} className="mt-8 bg-[#005FA3] text-white font-bold py-4 px-10 rounded-full shadow-lg hover:bg-[#004A80] transition-all">
                {currentIndex < testPassages.length - 1 ? 'Next Passage \u2192' : 'Complete Evaluation \u2192'}
              </button>
            )}
          </div>
        </main>
      )}

      {/* Custom Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setShowConfirmModal(false)}
          ></div>
          
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in duration-200">
            <div className="p-8 pb-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-2xl font-bold text-black mb-1">
                    Return Home
                  </h3>
                  <p className="text-gray-500 text-sm">Are you sure you want to leave the test?</p>
                </div>
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="text-gray-400 hover:text-gray-800 transition-colors mt-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-8 pb-8 text-left">
              <p className="text-gray-700 font-medium mb-8">
                Your current progress will be reset and you will have to start over.
              </p>
              
              <div className="flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setShowConfirmModal(false)}
                  className="w-1/2 px-6 py-3 rounded-lg font-bold text-gray-700 bg-[#F3F4F6] hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={confirmReturnHome}
                  className="w-1/2 px-6 py-3 rounded-lg font-bold text-white bg-black hover:bg-gray-800 transition-all shadow-md"
                >
                  Proceed to Leave
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}