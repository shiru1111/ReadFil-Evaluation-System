# nlp_config.py

SYNONYM_PAIRS = [
    {'ng', 'nang'},
    {'mga', 'manga'},
    {'kanya', 'kaniya'},
    {'kanyang', 'kaniyang'},
    {'sya', 'siya'},
    {'syay', 'siyay', 'shyay'},
    {'nya', 'niya'},
    {'nyang', 'niyang'},
    {'bbe', 'bibe'},
    {'quezon', 'kezon'},
    {'suplay', 'suply', 'supply'},
    {'kweba', 'kuweba'},
]

ENCLITIC_Y_BASES = {
    'sila', 'siya', 'sya', 'ito', 'iyan', 'iyon', 'kami', 'kayo', 'tayo',
    'ako', 'ikaw', 'dito', 'doon', 'diyan', 'wala', 'hindi',
    'animo', 'palibhasa', 'diumano', 'kung', 'ba', 'na', 'raw',
}

TAGALOG_PARTICLES = [
    'nang', 'ang', 'na', 'sa', 'at', 'ay', 'si', 'ni', 'pa', 'ma', 'ka',
    'ko', 'mo', 'o', 'yo', 'to'
]

EXPERT_CORRECTIONS = {
    'munithindi': 'ngunit hindi',
    'naiinit': 'naiinip',
    'ubalit': 'subalit',
    'ditoay': 'ditoy',
    'asama': 'kasama',
    'kasa': 'kasama',
    'palipasay': 'palibhasay',
    'tunaiynyang': 'tunay ngang',
    'saan niya': 'sa kaniya',
    'lihamg': 'liham',
}