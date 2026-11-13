/* RPAssistant — Vampire: The Masquerade 5th Edition: данные листа персонажа и движок бросков.
   Термины — по русскому изданию V5 («Студия 101»); где в русском издании названия нет, перевод наш, оригинал всегда рядом.
   Силы, ритуалы, церемонии, формулы и стили охоты — из всех официальных книг V5 с указанием источника. */
const VTM={};

VTM.ATTRS=[
  ['physical','Физические',[['str','Сила'],['dex','Ловкость'],['sta','Выносливость']]],
  ['social','Социальные',[['cha','Обаяние'],['man','Манипуляция'],['com','Самообладание']]],
  ['mental','Ментальные',[['int','Интеллект'],['wit','Смекалка'],['res','Упорство']]],
];
VTM.SKILLS=[
  ['physical','Физические',[['athletics','Атлетика'],['brawl','Драка'],['craft','Ремесло'],['drive','Вождение'],['firearms','Стрельба'],['larceny','Воровство'],['melee','Фехтование'],['stealth','Скрытность'],['survival','Выживание']]],
  ['social','Социальные',[['animalken','Обращение с животными'],['etiquette','Этикет'],['insight','Проницательность'],['intimidation','Запугивание'],['leadership','Лидерство'],['performance','Исполнение'],['persuasion','Убеждение'],['streetwise','Уличное чутьё'],['subterfuge','Хитрость']]],
  ['mental','Ментальные',[['academics','Гуманитарные науки'],['awareness','Наблюдательность'],['finance','Финансы'],['investigation','Расследование'],['medicine','Медицина'],['occult','Оккультизм'],['politics','Политика'],['science','Естественные науки'],['technology','Техника']]],
];
VTM.ATTR_NAME={};VTM.ATTRS.forEach(g=>g[2].forEach(([k,n])=>VTM.ATTR_NAME[k]=n));
VTM.SKILL_NAME={};VTM.SKILLS.forEach(g=>g[2].forEach(([k,n])=>VTM.SKILL_NAME[k]=n));
VTM.ATTR_SPREAD=[4,3,3,3,2,2,2,2,1];
VTM.SKILL_SPREADS={
  jack:{name:'Мастер на все руки',hint:'1 навык на 3, 8 на 2, 10 на 1',d:{3:1,2:8,1:10}},
  balanced:{name:'Сбалансированный',hint:'3 навыка на 3, 5 на 2, 7 на 1',d:{3:3,2:5,1:7}},
  specialist:{name:'Специалист',hint:'1 навык на 4, 3 на 3, 3 на 2, 3 на 1',d:{4:1,3:3,2:3,1:3}},
};
VTM.FREE_SPEC_SKILLS=['academics','craft','performance','science'];

VTM.DISC={animalism:'Анимализм',auspex:'Ясновидение',bloodsorcery:'Кровавое чародейство',celerity:'Стремительность',dominate:'Доминирование',
  fortitude:'Стойкость',obfuscate:'Сокрытие',oblivion:'Обливион',potence:'Мощь',presence:'Величие',protean:'Метаморфозы',alchemy:'Алхимия слабокровных'};
VTM.DISC_EN={animalism:'Animalism',auspex:'Auspex',bloodsorcery:'Blood Sorcery',celerity:'Celerity',dominate:'Dominate',fortitude:'Fortitude',obfuscate:'Obfuscate',oblivion:'Oblivion',potence:'Potence',presence:'Presence',protean:'Protean',alchemy:'Thin-blood Alchemy'};
VTM.DISC_ICON={animalism:'🐺',auspex:'👁️',bloodsorcery:'🩸',celerity:'⚡',dominate:'🌀',fortitude:'🛡️',obfuscate:'🌫️',oblivion:'🌑',potence:'💪',presence:'👑',protean:'🦇',alchemy:'⚗️'};

/* книги-источники */
VTM.SRC={CB:'Основная книга (Corebook)',CMP:'Companion',PG:'Players Guide',CBG:'Cults of the Blood Gods',CBN:'Chicago by Night',FOL:'Fall of London',SBH:'Sabbat: The Black Hand',GW:'Gehenna War',TF:'Tattered Façade',CD:'Courts of the Damned',WT:"Winter's Teeth #3",LSC:'Live from the Succubus Club',FR:'Forbidden Religions',BSL:'Blood Stained Love',BS:'Blood Sigils',BNA:'Book of Nod Apocrypha',LSR:'Let the Streets Run Red',IM:'In Memoriam',CF:'Chicago Folios',SI:'Second Inquisition',TAB:'Trails of Ash and Bone',ANA:'Anarch',CAM:'Camarilla'};
VTM.srcText=s=>(s||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/^([A-Z]+)\s*(.*)$/);return m?`${VTM.SRC[m[1]]||m[1]}${m[2]?', с. '+m[2]:''}`:x}).join('; ');

/* силы: «уровень|id|English|Русское|цена|пул|против|амальгама|источник|ветка»
   цена: число проверок пробуждения (0 — бесплатно), «1+» и т.п. — переменная; пул: «man/cha+animalism» = Манипуляция или Обаяние + Анимализм */
const POW_SRC={
animalism:`1|bond_famulus|Bond Famulus|Фамулус|0|cha+animalken|||CB 245
1|sense_beast|Sense the Beast|Чутьё на зверя|0|res+animalism|Самообладание + Хитрость||CB 245
2|animal_messenger|Animal Messenger|Звериный посланник|1|||auspex:1|PG 69
2|atavism|Atavism|Атавизм|1|com+animalism|||WT
2|feral_whispers|Feral Whispers|Язык животных|1|man/cha+animalism|||CB 246
2|leash_beast|Leash the Beast|Обуздать Зверя|1-2|||fortitude:1|LSC 27
2|tracing_blood|Tracing the Blood|По следу крови|1|res+animalism|||CD 214
3|messengers_command|Messenger's Command|Приказ через посланника|0|||dominate:1|PG 69
3|animal_succulence|Animal Succulence|Зверский аппетит|0||||CB 246
3|plague_beasts|Plague of Beasts|Нашествие зверей|1|man+animalism|Самообладание + Обращение с животными||PG 69
3|quell_beast|Quell the Beast|Усмирение Зверя|1|cha+animalism|Выносливость + Упорство||CB 246
3|scent_prey|Scent of Prey|Запах добычи|1|res+animalism|||SBH 47
3|unliving_hive|Unliving Hive|Трупный улей|0|||obfuscate:2|CB 246
3|augury|Augury|Ауспиции|1|man+animalism||auspex:1|TF 89-90
3|awaken_parasite|Awaken the Parasite|Пробудить паразита|1|res+animalism|Самообладание + Упорство (смертный: Выносливость + Смекалка)||TF 90
4|subsume_spirit|Subsume the Spirit|Поглощение духа|1|man+animalism|||CB 247
4|sway_flock|Sway the Flock|Повести стаю|1+|com+animalism|||PG 69
5|animal_dominion|Animal Dominion|Царь зверей|2|cha+animalism|||CB 247
5|coax_temper|Coax the Bestial Temper|Разжечь звериный нрав|1|man+animalism|||PG 70
5|drawing_out_beast|Drawing Out the Beast|Отчуждение зверя|1|wit+animalism|Самообладание + Упорство||CB 247
5|spirit_walk|Spirit Walk|Странствие духа|0||||GW 46`,
auspex:`1|heightened_senses|Heightened Senses|Обострение чувств|0|wit+res|||CB 249
1|sense_unseen|Sense the Unseen|Потустороннее зрение|0|wit/res+auspex|||CB 249
2|panacea|Panacea (Obeah)|Обиях (Панацея)|1|com+auspex||fortitude:1|CMP 24; PG 70
2|premonition|Premonition|Предвестие|0-1|res+auspex|||CB 249
2|reveal_temperament|Reveal Temperament|Распознать темперамент|1|int+auspex|Самообладание + Хитрость||PG 71
2|unerring_pursuit|Unerring Pursuit|Неотступная погоня|1|res+auspex||dominate:1|SBH 46
3|vermin_vision|Vermin Vision|Глазами паразитов|1|res+animalism||animalism:2|FOL 30
3|fatal_flaw|Fatal Flaw|Роковой изъян|1|int+auspex|Самообладание/Выносливость + Хитрость|oblivion:1|PG 71
3|scry_soul|Scry the Soul|Познание души|1|int+auspex|Самообладание + Хитрость||CB 250
3|share_senses|Share the Senses|Слияние чувств|1|res+auspex|||CB 250
3|haruspex|Haruspex|Гаруспиция|1|res+auspex||oblivion:1|TF 91
3|read_room|Read the Room|Прочесть зал|1|int+auspex|||CD 214
3|reveal_leash|Reveal the Invisible Leash|Увидеть незримый поводок|1|int+auspex|Самообладание + Упорство||CD 214
4|spirits_touch|Spirit's Touch|Психометрия|1|int+auspex|||CB 250
4|heart_laid_bare|Heart Laid Bare|Обнажённое сердце|1|int+auspex|Самообладание + Хитрость||TF 91-92
5|clairvoyance|Clairvoyance|Дальновидение|1|int+auspex|||CB 251
5|possession|Possession|Вселение|2|res+auspex|Упорство + Интеллект|dominate:3|CB 251
5|telepathy|Telepathy|Телепатия|1|res+auspex|Смекалка + Хитрость||CB 252
5|unburdening|Unburdening the Bestial Soul|Облегчение звериной души|2|com+auspex||dominate:3|CMP 24; PG 71`,
bloodsorcery:`1|corrosive_vitae|Corrosive Vitae|Едкая кровь|1+||||CB 272
1|sanguine_sacrament|Shape the Sanguine Sacrament|Кровавое таинство|0|man+bloodsorcery|||WT; BNA 33; TF 92
1|taste_for_blood|A Taste for Blood|Вкус крови|0|res+bloodsorcery|||CB 272
1|koldunic_sorcery|Koldunic Sorcery|Колдунское чародейство|1|res+bloodsorcery|Смекалка/Упорство + Сокрытие||BS 61
2|bloods_curse|Blood's Curse|Проклятие крови|1|int+bloodsorcery|Выносливость + Оккультизм/Стойкость||GW 48
2|extinguish_vitae|Extinguish Vitae|Истончение витэ|1|int+bloodsorcery|Выносливость + Самообладание||CB 272
2|scour_secrets|Scour Secrets|Вычерпать тайны|1|int+bloodsorcery|||PG 98; BNA 34
2|vinculum_magnum|Vinculum Magnum|Винкулум Магнум|0||||CD 214-215
3|blood_of_potency|Blood of Potency|Сгущение крови|1|res+bloodsorcery|||CB 273
3|scorpions_touch|Scorpion's Touch|Касание скорпиона|1+|str+bloodsorcery|Выносливость + Оккультизм/Стойкость||CB 273
3|transitive_bond|Transitive Bond|Переходные узы|1||||SBH 49
3|ripples_heart|Ripples of the Heart|Рябь сердца|1||||BSL 153
4|theft_of_vitae|Theft of Vitae|Хищение крови|1|wit+bloodsorcery|Смекалка + Оккультизм||CB 274
4|blood_aegis|Blood Aegis|Кровавая эгида|1+||||PG 98
4|fulminating_vitae|Fulminating Vitae|Взрывное витэ|2|sta+bloodsorcery|Смекалка + Атлетика||TF 92-93
4|marionette|Marionette|Марионетка|1|man+bloodsorcery|Выносливость + Оккультизм/Стойкость||TF 93
5|baals_caress|Baal's Caress|Ласка Ваала|1+|str+bloodsorcery|Выносливость + Оккультизм/Стойкость||CB 274
5|cauldron_of_blood|Cauldron of Blood|Котёл крови|1|res+bloodsorcery|Самообладание + Оккультизм/Стойкость||CB 274
5|reclamation_vitae|Reclamation of Vitae|Возврат витэ|пятна||||SBH 50`,
celerity:`1|cats_grace|Cat's Grace|Кошачья грация|0||||CB 252
1|fluent_swiftness|Fluent Swiftness|Плавная стремительность|0||||GW 46
1|rapid_reflexes|Rapid Reflexes|Быстрая реакция|0||||CB 253
2|fleetness|Fleetness|Проворство|1||||CB 253
2|rush_job|Rush Job|Аврал|1||||PG 72
3|blink|Blink|Быстрее ветра|1|dex+athletics|||CB 253
3|traversal|Traversal|Траверс|1|dex+athletics|||CB 253
3|weaving|Weaving|Петляние|1||||PG 72
3|thousand_cuts|A Thousand Cuts|Тысяча порезов|1||||TF 96
4|blurred_momentum|Blurred Momentum|Размытый порыв|1||||PG 72
4|draught_elegance|Draught of Elegance|Глоток изящества|1||||CB 254
4|unerring_aim|Unerring Aim|Безупречная точность|1|||auspex:2|CB 254
4|unseen_strike|Unseen Strike|Незримый удар|2|dex+celerity|Смекалка + Наблюдательность|obfuscate:4|PG 73
4|faster_than_light|Faster than Light|Быстрее света|1||||LSC 27
5|lightning_strike|Lightning Strike|Молниеносный удар|1||||CB 254
5|split_second|Split Second|Скорость мысли|1||||CB 254`,
dominate:`1|cloud_memory|Cloud Memory|Провал в памяти|0|cha+dominate|Смекалка + Упорство||CB 256
1|compel|Compel|Принуждение|0|cha+dominate|Интеллект + Упорство||CB 256
1|slavish_devotion|Slavish Devotion|Рабская преданность|0|||fortitude:1|CBG 104; PG 73
2|mesmerize|Mesmerize|Внушение|1|man+dominate|Интеллект + Упорство||CB 256
2|dementation|Dementation|Помешательство|1|man+dominate|Самообладание + Интеллект|obfuscate:2|CB 256
2|domitors_favor|Domitor's Favor|Услуга Домитора|1||||CMP 25; PG 74
2|stolen_voice|The Stolen Voice|Украденный голос|1|com+dominate|Упорство + Исполнение||TF 96-97
3|forgetful_mind|Forgetful Mind|Забвение|1|man+dominate|Интеллект + Упорство||CB 257
3|submerged_directive|Submerged Directive|Внедрённая директива|0||||CB 257
3|chain_command|Chain of Command|Цепь приказов|1||||CD 215
4|ancestral_dominion|Ancestral Dominion|Власть предков|1|man+dominate|Упорство + Оккультизм|bloodsorcery:2|CBG 104; PG 74
4|implant_suggestion|Implant Suggestion|Внедрить внушение|1|man+dominate|Самообладание + Упорство|presence:1|PG 74
4|rationalize|Rationalize|Оправдание|0||||CB 257
4|tabula_rasa|Tabula Rasa|Чистый лист|2|res+dominate|Самообладание + Упорство||SBH 47
5|lethes_call|Lethe's Call|Зов Леты|1|man+dominate|Интеллект + Упорство||GW 46
5|mass_manipulation|Mass Manipulation|Стадный инстинкт|1||||CB 257
5|terminal_decree|Terminal Decree|Приказ на самоуничтожение|0||||CB 257`,
fortitude:`1|fluent_endurance|Fluent Endurance|Плавная выносливость|0||||GW 46
1|resilience|Resilience|Сила жизни|0||||CB 258
1|unswayable_mind|Unswayable Mind|Твёрдость духа|0||||CB 258
2|earths_perseverance|Earth's Perseverance|Стойкость земли|1||||PG 74
2|enduring_beasts|Enduring Beasts|Живучие звери|1|sta+animalism||animalism:1|CB 258
2|invigorating_vitae|Invigorating Vitae|Бодрящее витэ|0|||auspex:1|PG 75
2|obdurate|Obdurate|Непоколебимость|1|wit+survival||potence:2|WT
2|toughness|Toughness|Непрошибаемость|1||||CB 258
2|self_assurance|Self-Assurance|Самоуверенность|1||||LSC 27-28
3|defy_bane|Defy Bane|Превозмогание проклятия|1|wit+survival|||CB 259
3|fortify_facade|Fortify the Inner Façade|Укрепление сознания|0||||CB 259
3|seal_maw|Seal the Beast's Maw|Запечатать пасть Зверя|2||||FR 44
3|valeren|Valeren|Валерен|1|int+fortitude||auspex:1|CMP 25; PG 75
3|calloused_soul|Calloused Soul|Огрубевшая душа|2 пятна||||TF 97-98
4|draught_endurance|Draught of Endurance|Глоток упорства|1||||CB 259
4|gorgons_scales|Gorgon's Scales|Чешуя горгоны|1||||PG 75
4|shatter|Shatter|Расколоть|1||||CBG 104
5|flesh_of_marble|Flesh of Marble|Мраморная плоть|2||||CB 259
5|prowess_from_pain|Prowess from Pain|Сила из боли|1||||CB 260
5|meat_shields|Meat Shields|Живой щит|1||||TF 98`,
obfuscate:`1|cloak_shadows|Cloak of Shadows|Плащ теней|0||||CB 261
1|ensconce|Ensconce|Укрыть|0||||GW 46
1|silence_death|Silence of Death|Безмолвие смерти|0||||CB 261
1|mask_of_ages|Mask of Ages|Маска веков|1||||LSC 28
2|cache|Cache|Тайник|1||||GW 47
2|chimerstry|Chimerstry|Химерия|1|man+obfuscate|Самообладание + Смекалка|presence:1|CMP 25; PG 76
2|ghosts_passing|Ghost's Passing|Призрачный след|1|||animalism:1|FR 18
2|unseen_passage|Unseen Passage|Незримая поступь|1||||CB 261
2|ventriloquism|Ventriloquism|Чревовещание|1|wit+obfuscate|Упорство + Самообладание|auspex:2|FOL 31
2|doubletalk|Doubletalk|Двойная речь|1|com+obfuscate|Смекалка + Ясновидение|auspex:1|BSL 152
3|fata_morgana|Fata Morgana|Фата моргана|1|man+obfuscate||presence:2|CMP 26; PG 77
3|ghost_machine|Ghost in the Machine|Электронный призрак|0||||CB 262
3|mask_thousand|Mask of a Thousand Faces|Маска тысячи лиц|1||||CB 262
3|mask_isolation|Mask of Isolation|Маска отчуждения|1|man+obfuscate|Обаяние + Проницательность|dominate:1|SBH 48
3|mental_maze|Mental Maze|Ментальный лабиринт|1-3|cha+obfuscate|Смекалка + Упорство|dominate:1|CBG 85; PG 77
3|mind_masque|Mind Masque|Маска разума|1|int+obfuscate||dominate:2|PG 78
3|guise_departed|Guise of the Departed|Облик усопшего|1|wit+obfuscate||oblivion:1|TF 98-99
4|conceal|Conceal|Маскировка|1|int+obfuscate||auspex:3|CB 262
4|vanish|Vanish|Бесследное исчезновение|0|wit+obfuscate|Смекалка + Наблюдательность||CB 262
4|seclusion|Seclusion|Уединение|1|man+obfuscate|Упорство + Наблюдательность|dominate:1|TF 99
5|cloak_gathering|Cloak the Gathering|Тайное собрание|1||||CB 263
5|impostors_guise|Impostor's Guise|Личина самозванца|1|wit+obfuscate|Манипуляция + Исполнение||CB 263`,
oblivion:`1|ashes_to_ashes|Ashes to Ashes|Прах к праху|1|sta+oblivion|Выносливость + Медицина/Стойкость||CBG 204; PG 85|некромантия
1|binding_fetter|Binding Fetter|Узреть оковы|0|wit+oblivion|||CBG 204; PG 85|некромантия
1|oblivion_sight|Oblivion Sight|Взор бездны|0||||CBN 293; PG 85|тени
1|shadow_cloak|Shadow Cloak|Покров теней|0||||CBN 293; PG 85; FOL 264|тени
2|arms_ahriman|Arms of Ahriman|Руки Аримана|1|wit+oblivion||potence:2|CBN 294; PG 86|тени
2|fatal_prediction|Fatal Prediction|Роковое предсказание|1|res+oblivion|Смекалка + Оккультизм|auspex:2|PG 87|некромантия
2|fatal_precognition|Fatal Precognition|Знамение смерти|1|res+oblivion||auspex:2|CBG 204|некромантия
2|shadow_cast|Shadow Cast|Призыв тени|1||||CBN 293; PG 87|тени
2|where_veil_thins|Where the Veil Thins|Прорехи в Саване|1|int+oblivion|||CBG 205; PG 87|некромантия
3|aura_decay|Aura of Decay|Аура разложения|1|sta+oblivion|Выносливость + Медицина/Стойкость||CBG 205; PG 88|некромантия
3|passion_feast|Passion Feast|Пир страстей|0|res+oblivion|Упорство + Самообладание|fortitude:2|CBG 206; PG 89|некромантия
3|shadow_perspective|Shadow Perspective|Взгляд из тени|1||||CBN 294; PG 89|тени
3|shadow_servant|Shadow Servant|Теневой слуга|1|||auspex:1|PG 89|тени
3|touch_oblivion|Touch of Oblivion|Прикосновение тьмы|1||||CBN 294; PG 89|тени
4|necrotic_plague|Necrotic Plague|Некрочума|1|int+oblivion|Выносливость + Медицина/Стойкость||CBG 206; PG 89|некромантия
4|profane_sanctified|Profane the Sanctified|Осквернение святыни|1|res+oblivion|проверка Воли||TF 100
4|stygian_shroud|Stygian Shroud|Покров Стигии|1||||CBN 295; PG 90|тени
4|umbrous_clutch|Umbrous Clutch|Хватка мрака|1 + пятно|wit+oblivion|Ловкость + Смекалка||SBH 49|тени
5|darkness_within|The Darkness Within|Тьма внутри|2|man+oblivion|Самообладание + Упорство||TF 100
5|shadow_step|Shadow Step|Шаг сквозь тень|1||||CBN 295; PG 90|тени
5|skuld_fulfilled|Skuld Fulfilled|Обещание Скульд|2|sta+oblivion|Выносливость + Выносливость/Стойкость||CBG 207; PG 91|некромантия
5|tenebrous_avatar|Tenebrous Avatar|Аватар тьмы|2||||CBN 295; PG 91|тени
5|withering_spirit|Withering Spirit|Иссушение духа|2 + пятна|res+oblivion|Упорство + Оккультизм/Стойкость||CBG 208|некромантия`,
potence:`1|fluent_strength|Fluent Strength|Плавная сила|0||||GW 47
1|lethal_body|Lethal Body|Смертоносность|0||||CB 264
1|soaring_leap|Soaring Leap|Мощный прыжок|0||||CB 264
2|prowess|Prowess|Сокрушение|1||||CB 264
2|relentless_grasp|Relentless Grasp|Неумолимая хватка|1||||PG 79
3|brutal_feed|Brutal Feed|Грубое насыщение|0||||CB 264
3|exuberance|Exuberance|Кипучесть|0||||TF 103
3|spark_of_rage|Spark of Rage|Искра ярости|1|man+potence|Самообладание + Интеллект|presence:3|CB 265
3|uncanny_grip|Uncanny Grip|Мёртвая хватка|1||||CB 265
3|wrecker|Wrecker|Крушитель|0||||PG 79
4|draught_might|Draught of Might|Глоток могущества|1||||CB 265
4|crash_down|Crash Down|Обрушиться|1|str+potence|Ловкость + Атлетика||PG 79
5|earthshock|Earth Shock|Землетрясение|2||||CB 265
5|fist_of_caine|Fist of Caine|Кулак Каина|1||||CB 266
5|subtle_hammer|Subtle Hammer|Тонкий молот|0||||PG 79`,
presence:`1|awe|Awe|Благоговение|0||||CB 267
1|daunt|Daunt|Угроза|0||||CB 267
1|eyes_serpent|Eyes of the Serpent|Глаза змея|0|cha+presence|Смекалка + Самообладание|protean:1|ANA 185; PG 80
2|lingering_kiss|Lingering Kiss|Незабываемый поцелуй|0||||CB 267; CMP 62
2|melpominee|Melpominee|Мельпомена|0|cha+presence|||PG 80
2|predators_lure|Predator's Lure|Приманка хищника|1|cha+leadership|Самообладание + Упорство||CD 215
3|clear_field|Clear the Field|Очистить поле|1|com+presence|Смекалка + Самообладание|dominate:3|FOL 31
3|dread_gaze|Dread Gaze|Устрашающий взор|1|cha+presence|Самообладание + Упорство||CB 267
3|entrancement|Entrancement|Очарование|1|cha+presence|Самообладание + Смекалка||CB 268
3|passion_leech|Passion Leech|Пиявка страстей|1|com+auspex||auspex:2|TF 104
3|thrown_voice|Thrown Voice|Отброшенный голос|1|||auspex:1|PG 80
3|true_loves_face|True Love's Face|Лицо истинной любви|1|man+presence|Самообладание + Смекалка|obfuscate:3|CBG 85
3|invigorating_display|Invigorating Display|Воодушевляющее зрелище|1|com+presence|||LSC 28
4|inflame_desire|Inflame Desire|Разжечь желание|1|man+presence|Самообладание + Упорство|obfuscate:1|TF 104
4|irresistible_voice|Irresistible Voice|Притягательный голос|0|||dominate:1|CB 268
4|magnum_opus|Magnum Opus|Магнум опус|1+|cha/man+craft||auspex:3|WT
4|suffuse_edifice|Suffuse the Edifice|Наполнить здание|0||||PG 80
4|summon|Summon|Призыв|1|man+presence|Самообладание + Интеллект||CB 268
4|wingman|Wingman|Второй пилот|1||||BSL 152
5|majesty|Majesty|Преклонение|2|cha+presence|Самообладание + Упорство||CB 268
5|star_magnetism|Star Magnetism|Звезда эфира|1||||CB 269`,
protean:`1|eyes_of_beast|Eyes of the Beast|Глаза Зверя|0||||CB 269
1|squirm|Squirm|Извивание|0-1||||TF 105
1|weight_feather|Weight of the Feather|Лёгкость пёрышка|0|wit+survival|||CB 269
2|feral_weapons|Feral Weapons|Оружие Зверя|1||||CB 270
2|vicissitude|Vicissitude|Превратность|1|res+protean||dominate:2|CMP 27; PG 81
2|serpents_kiss|Serpent's Kiss|Поцелуй змея|1||||BSL 153
2|false_sip|The False Sip|Ложный глоток|1|||fortitude:1|BSL 153
3|earth_meld|Earth Meld|Слияние с землёй|1||||CB 270
3|fleshcrafting|Fleshcrafting|Изменение плоти|1|res+protean|Выносливость + Упорство|dominate:2|CMP 27; PG 82
3|shapechange|Shapechange|Смена облика|1||||CB 270
3|visceral_absorption|Visceral Absorption|Поглощение плоти|1|str+protean||bloodsorcery:2|SBH 49
3|masque_death|Masque of Death|Маска смерти|1|||oblivion:2|LSC 28
4|horrid_form|Horrid Form|Ужасная форма|1|||dominate:2|CMP 28; PG 83
4|metamorphosis|Metamorphosis|Перевоплощение|1||||CB 271
5|blood_form|Blood Form|Кровавый облик|1|||bloodsorcery:2|GW 47
5|heart_darkness|The Heart of Darkness|Сердце тьмы|0|||fortitude:2|CBG 85
5|master_forms|Master of Forms|Повелитель форм|0||||GW 48
5|mist_form|Mist Form|Превращение в туман|1-3||||CB 271
5|one_with_land|One with the Land|Единство с землёй|2|||animalism:2|CMP 28; PG 83
5|swarm|Swarm|Рой|2||||TF 106
5|unfettered_heart|The Unfettered Heart|Свободное сердце|0||||CB 271
5|face_victim|Face of the Victim|Лицо жертвы|1||||LSC 28-29`,
alchemy:`1|body_paint|Body Paint|Нательная роспись|0|dex+craft|||BS 73
1|checkout_time|Checkout Time|Время выселения|0||||BS 74
1|elevate|Elevate|Вознесение|0|sta+alchemy|||BS 74
1|far_reach|Far Reach|Длинная рука|0|res+alchemy|||CB 284
1|food_stain|Food Stain|Пищевое пятно|0||||BS 74
1|gaolers_bane|Gaoler's Bane|Погибель тюремщика|0||||WT 10
1|haze|Haze|Дымка|0||||CB 285
1|mercurian_tongue|Mercurian Tongue|Язык Меркурия|0||||PG 103
1|plug_in|Plug-In|Подключение|0|res+alchemy|||PG 103
1|portable_shade|Portable Shade|Карманная тень|0|sta+alchemy|||SBH 53
1|speak_heart|Speak From the Heart|Говорить от сердца|0||||BS 75
2|advanced_torpor|Advanced Torpor|Глубокий торпор|0||||BS 75
2|blacklight_surprise|Blacklight Surprise|Сюрприз в ультрафиолете|0||||BS 75
2|blood_mandagloire|Blood of Mandagloire|Кровь Мандаглуара|0||||SI 46
2|blue_state|Blue State|Синее состояние|0||||BS 76
2|envelop|Envelop|Окутать|0|wit+alchemy|||CB 285
2|friends_list|Friends List|Список друзей|0|int+alchemy|||PG 104
2|mirror_trust|Mirror of Trust|Зеркало доверия|0||||SI 46
2|reds_hot_sauce|Red's Flaming Hot Sauce|Огненный соус Реда|0||||WT 10
2|whiff_its|Whiff-Its|Нюхачи|0|res+awareness|||GW 50
2|counterfeit2|Counterfeit Discipline ••|Подделка дисциплины (ур. 2)|0||||CB 285
3|bleed_out|Bleed Out|Истечь кровью|0||||TF 107
3|chem_flashback|Chemically-Induced Flashback|Химическая вспышка памяти|0||||CBG 45
3|concoct_ashe|Concoct Ashe|Сварить пепел|0|int+alchemy|||CBG 45
3|diamond_skin|Diamond Skin|Алмазная кожа|0||||BS 76
3|defractionate|Defractionate|Дефракционирование|0||||CB 286
3|fang_stinger|Fang-Stinger|Жало-клык|0|res+alchemy|||SI 47
3|fireskin|Fireskin|Огненная кожа|0||||BS 76
3|freezer_fluid|Freezer Fluid|Морозная жидкость|0|res+alchemy|||SI 47
3|hospital_chains|Hospital Chains|Больничные цепи|0||Выносливость||BS 76
3|mandagloire|Mandagloire|Мандаглуар|0|sta+alchemy|||PG 104
3|martian_purity|Martian Purity|Марсианская чистота|0||||BS 77
3|mask_off|Mask Off|Маска долой|0||||BS 77
3|sunburn|On-Demand Sunburn|Загар по заказу|0||||SBH 53
3|profane_hieros|Profane Hieros Gamos|Профанный гиерогамос|0|sta+res|||CB 286
3|rumor|Rumor|Слух|0|man+alchemy|||PG 105
3|stay_sand|Stay the Falling Sand|Остановить песок|0|res+alchemy|||WT 10
3|saraimu|Saraimu|Сараиму|0|res+alchemy|||TF 107
3|tank|Tank|Танк|0||||PG 105
3|tlc|TLC|Нежная забота|0||||BS 77
3|troll_pious|Troll the Pious|Троллить праведников|0||||BS 78
3|counterfeit3|Counterfeit Discipline •••|Подделка дисциплины (ур. 3)|0||||CB 287
4|airborne_momentum|Airborne Momentum|Воздушный разгон|0|str+alchemy|||CB 287
4|copycat|Copycat|Подражатель|0||||BS 78
4|disc_channeling|Discipline Channeling|Проводник дисциплины|0||||CBG 46
4|halfliving_conductor|Half-Living Conductor|Полуживой проводник|0|sta+alchemy|||BS 79
4|hollow_leg|Hollow Leg|Бездонная глотка|0|int+alchemy|||WT 10
4|juice_box|Juice Box|Коробочка сока|0||||GW 51
4|red_state|Red State|Красное состояние|0||||BS 79
4|short_circuit|Short Circuit|Короткое замыкание|0||||PG 105
4|toxic_personality|Toxic Personality|Токсичная личность|0|str/dex+alchemy|||PG 105
4|vitae_msg|Vitae MSG|Витэ-глутамат|0||||BS 79
4|counterfeit4|Counterfeit Discipline ••••|Подделка дисциплины (ур. 4)|0||||CB 287
5|awaken_sleeper|Awaken the Sleeper|Пробудить спящего|0||||CB 287
5|beast_mode|Beast Mode|Режим Зверя|0||||GW 51
5|da_bomb|Da Bomb|Бомба|0||||TF 108
5|flowering_amaranth|Flowering Amaranth|Цветущий амарант|0|res+alchemy|||PG 106
5|moment_clarity|Moment of Clarity|Миг ясности|0||||PG 106
5|saturns_flux|Saturn's Flux|Поток Сатурна|0||||BS 80
5|counterfeit5|Counterfeit Discipline •••••|Подделка дисциплины (ур. 5)|0||||CB 287`,
};
/* краткие описания сил основной книги и дополнений */
const POW_DESC={bond_famulus:'Животное становится фамулусом и выполняет простые команды.',sense_beast:'Чувствует враждебность и Зверя в существах.',feral_whispers:'Разговор с животными, призыв их на помощь.',animal_succulence:'Кровь животных утоляет Голод лучше.',quell_beast:'Подавляет Зверя и порывы цели.',unliving_hive:'Рои насекомых как фамулус.',subsume_spirit:'Переносит разум в тело животного.',animal_dominion:'Командует стаями и роями.',drawing_out_beast:'Переносит свою ярость на другого.',
heightened_senses:'Сверхострые чувства, + Ясновидение к броскам восприятия.',sense_unseen:'Замечает сверхъестественное и скрытое.',premonition:'Видения и подсказки.',scry_soul:'Читает ауру: эмоции, природа, диаблери.',share_senses:'Смотрит чужими глазами.',spirits_touch:'Чувствует прошлое предмета или места.',clairvoyance:'Собирает сведения о районе.',possession:'Вселяется в тело смертного.',telepathy:'Читает мысли, передаёт свои.',panacea:'Успокаивает и исцеляет разум цели.',unburdening:'Облегчает душу цели.',
corrosive_vitae:'Кровь разъедает неживую материю.',taste_for_blood:'Узнаёт по вкусу резонанс, поколение, природу крови.',extinguish_vitae:'Усиливает Голод вампира-цели.',blood_of_potency:'Временно повышает Силу крови.',scorpions_touch:'Кровь становится ядом.',theft_of_vitae:'Высасывает кровь на расстоянии.',baals_caress:'Смертельный яд для вампиров.',cauldron_of_blood:'Кипятит кровь в жилах цели.',
cats_grace:'Идеальное равновесие.',rapid_reflexes:'Нет штрафа к защите от нескольких противников.',fleetness:'+ Стремительность к защите и броскам Ловкости вне боя.',blink:'Мгновенно преодолевает расстояние.',traversal:'Бег по стенам и воде.',draught_elegance:'Кровь даёт пьющему Стремительность.',unerring_aim:'Цель выстрела не может уклониться.',lightning_strike:'Атака, от которой нельзя защититься.',split_second:'Действует раньше, чем что-то произойдёт.',
cloud_memory:'Цель забывает последние минуты.',compel:'Короткая команда в одно действие.',mesmerize:'Сложная команда.',dementation:'Пробуждает внутренних демонов цели.',forgetful_mind:'Переписывает воспоминания.',submerged_directive:'Команда срабатывает позже по триггеру.',rationalize:'Жертва считает приказы своими решениями.',mass_manipulation:'Приказ целой группе.',terminal_decree:'Приказы могут вести к смерти цели.',domitors_favor:'Гулям труднее восстать против хозяина.',
resilience:'+ Стойкость к Здоровью.',unswayable_mind:'+ Стойкость к сопротивлению воздействию на разум.',toughness:'Вычитает Стойкость из лёгкого урона.',enduring_beasts:'Даёт Стойкость животным.',defy_bane:'Превращает тяжёлый урон в лёгкий.',fortify_facade:'Защита мыслей от Ясновидения.',draught_endurance:'Кровь даёт пьющему Стойкость.',flesh_of_marble:'Игнорирует первый источник физического урона за ход.',prowess_from_pain:'Нет штрафов от ран; урон усиливает атрибуты.',valeren:'Исцеляет другого вампира.',
cloak_shadows:'Невидимость, пока неподвижен в тени.',silence_death:'Гасит звуки, которые издаёт вампир.',unseen_passage:'Невидимость в движении.',ghost_machine:'Сокрытие действует и на камеры.',mask_thousand:'Выглядит неприметным незнакомцем.',conceal:'Скрывает предмет.',vanish:'Исчезает прямо на глазах.',cloak_gathering:'Скрывает спутников.',impostors_guise:'Принимает облик конкретного человека.',chimerstry:'Краткая иллюзия одного чувства.',fata_morgana:'Сложные иллюзии.',
shadow_cloak:'Тени окутывают вампира.',oblivion_sight:'Видит во тьме и призраков.',arms_ahriman:'Тени-щупальца хватают и бьют.',shadow_cast:'Создаёт область тьмы.',touch_oblivion:'Иссушающее касание.',shadow_step:'Перемещение из тени в тень.',shadow_perspective:'Видит и слышит сквозь тени.',tenebrous_avatar:'Становится тенью.',stygian_shroud:'Окутывает область тьмой Стигии.',ashes_to_ashes:'Обращает труп в прах.',binding_fetter:'Видит оковы призраков.',where_veil_thins:'Чувствует тонкость Савана.',aura_decay:'Всё вокруг гниёт и ржавеет.',passion_feast:'Питается страстями призраков.',necrotic_plague:'Насылает болезнь.',skuld_fulfilled:'Возвращает цели её смертные недуги.',withering_spirit:'Разрушает дух цели.',
lethal_body:'Удары без оружия наносят тяжёлый урон смертным.',soaring_leap:'Прыжок на огромное расстояние.',prowess:'+ Мощь к урону без оружия и к Силе.',brutal_feed:'Мгновенно осушает жертву.',spark_of_rage:'Разжигает гнев у толпы.',uncanny_grip:'Лазает по любой поверхности.',draught_might:'Кровь даёт пьющему Мощь.',earthshock:'Удар сбивает всех с ног.',fist_of_caine:'Удары наносят тяжёлый урон даже вампирам.',
awe:'+ Величие к Убеждению, Исполнению, Лидерству.',daunt:'+ Величие к Запугиванию.',lingering_kiss:'Жертва жаждет нового укуса.',dread_gaze:'Ужас: цель бежит или замирает.',entrancement:'Цель очарована и услужлива.',irresistible_voice:'Доминирование действует голосом, без взгляда.',summon:'Цель приходит к вампиру.',majesty:'Никто не смеет действовать против.',star_magnetism:'Силы Величия работают через экран.',
eyes_of_beast:'Видит в полной темноте.',weight_feather:'Почти ничего не весит.',feral_weapons:'Когти и клыки.',earth_meld:'Погружается в землю.',shapechange:'Превращается в животное своего размера.',metamorphosis:'Превращается в любое животное.',mist_form:'Становится туманом.',unfettered_heart:'Сердце блуждает — кол почти не берёт.',vicissitude:'Лепит собственную плоть.',fleshcrafting:'Лепит чужую плоть.',horrid_form:'Чудовищный боевой облик.',one_with_land:'Сливается с землёй домена.',
far_reach:'Телекинез.',haze:'Облако тумана.',envelop:'Туман душит и слепит.',profane_hieros:'Меняет облик и пол.',airborne_momentum:'Полёт.',awaken_sleeper:'Пробуждает вампира из торпора.',defractionate:'Делает кровь из пакетов пригодной.'};
VTM.POWERS={};VTM.POWER={};
const parsePool=s=>{if(!s)return null;const [a,b]=s.split('+');return a.split('/').flatMap(x=>b.split('/').map(y=>[x,y]))};
const parseCost=c=>{c=String(c||'0');const m=c.match(/^(\d+)/);return {r:m?+m[1]:0,txt:c==='0'?'бесплатно':/^\d+$/.test(c)?'🩸'.repeat(+c):c.replace(/^(\d+)(-\d+)?\+?/,(x,a,b)=>`🩸×${a}${b||''}${x.endsWith('+')?'+':''}`)}};
for(const [disc,txt] of Object.entries(POW_SRC)){
  VTM.POWERS[disc]=txt.trim().split('\n').map(line=>{const [l,id,en,n,cost,pool,vs,am,src,branch]=line.split('|');const c=parseCost(cost);
    const amg=am?am.split(':'):null;
    const p={id,l:+l,en,n,r:c.r,cost:c.txt,pool:parsePool(pool),vs:vs||'',am:amg?{d:amg[0],v:+amg[1]}:null,src,branch:branch||'',d:POW_DESC[id]||'',disc};
    VTM.POWER[id]=p;return p});
}
VTM.amText=p=>p.am?`${VTM.DISC[p.am.d]} ${'●'.repeat(p.am.v)}`:'';

/* ритуалы Кровавого чародейства и церемонии Обливиона */
const RIT_SRC=`1|Astromancy|Астромантия|BS 59
1|Beelzebeatit|Вельзевульбит|SBH 50
1|Bind the Accusing Tongue|Связать язык обвинителя|BS 60
1|Blood Apocrypha|Кровавые апокрифы|BNA 34
1|Blood Walk|Путь крови|CB 276
1|Bloody Message|Кровавое послание|LSR 77
1|Blood to Water|Кровь в воду|GW 48
1|Clinging of the Insect|Паучьи лапы|CB 276
1|Coax the Garden|Пробудить сад|CBG 55
1|Craft Bloodstone|Путеводный камень|CB 276
1|Douse the Fear|Погасить страх|CBG 67; PG 99
1|Enrich the Blood|Обогатить кровь|FR 76
1|Herd Ward (Minor)|Малая защита стада|LSR 77
1|Letter Ward|Печать на письме|LSR 77
1|Revealing the Crimson Trail|Алый след|GW 48
1|Seal the Brand|Запечатать клеймо|PG 99
1|Shared Memory|Общая память|IM 145
1|Wake with Evening's Freshness|Вечерняя бодрость|CB 276
1|Ward Against Ghouls|Защитная печать от гулей|CB 277
1|Blood Missive|Кровавая депеша|LSC 29
1|Sanguine Tidings|Кровавые вести|LSC 29
1|Preservation|Сохранение|CD 215-216
1|Rite of Introduction|Обряд представления|CD 216
2|As Fog on Water|Как туман над водой|PG 100
2|Calling the Aura's Remnants|Призыв остатков ауры|CF 171
2|Calix Secretus|Тайная чаша|PG 100
2|Communicate with Kindred Sire|Связь с сиром|CB 277
2|Craftmaster|Мастер ремесла|BS 62
2|Depths of Nightmare|Глубины кошмара|BS 62
2|Elemental Grasp|Хватка стихий|BS 62
2|Enhance Dyscrasia|Усилить дискразию|FR 77
2|Eyes of Babel|Очи Вавилонские|CB 277
2|Illuminate Trail of Prey|Озарить след добычи|CB 277
2|Le Sang de l'Amour|Кровь любви|BS 63; BSL 153
2|Soporific Touch|Усыпляющее касание|CAM 168; PG 100
2|Silentia Mortis|Безмолвие смерти|BS 64
2|Shroud of Silence|Покров тишины|FR 23
2|Stolen Memory|Украденное воспоминание|IM 145
2|Tiamat Glistens|Сияние Тиамат|BS 64
2|Truth of Blood|Истина в крови|CB 277|res
2|Unseen Underground|Незримое подземелье|FOL 31
2|Viscera Garden|Сад внутренностей|BS 65
2|Ward against Spirits|Защитная печать от духов|CB 277
2|Warding Circle against Ghouls|Защитный круг от гулей|CB 278
2|Web of Hunger|Паутина голода|FOL 31
3|Bladed Hands|Руки-клинки|CF 174
3|Bloodless Feast|Бескровный пир|FR 67
3|Blood Sigil|Кровавый сигил|BS 66
3|Communal Vigor|Общая сила|SBH 50
3|Dagon's Call|Зов Дагона|CB 278|res
3|Deflection of Wooden Doom|Отвращение деревянной погибели|CB 278
3|Elemental Shelter|Убежище стихий|BS 66
3|Essence of Air|Эссенция воздуха|CB 278
3|Eyes of the Past|Глаза прошлого|CF 172
3|Fire in the Blood|Огонь в крови|CBG 67; PG 100
3|Firewalker|Ходящий по огню|CB 279
3|Galvanic Ruination|Гальваническое разрушение|SBH 51
3|Gentle Mind|Кроткий разум|
3|Grim Chrysalis|Мрачная куколка|TF 93
3|Haunted House|Дом с привидениями|CF 175
3|Herd Ward (Major)|Большая защита стада|LSR 77
3|Illusion of Peaceful Death|Иллюзия мирной смерти|CF 172
3|Illusion of Perfection|Иллюзия совершенства|CF 174
3|Nepenthe|Непенф|BS 66
3|One with the Blade|Единство с клинком|CAM 168; PG 101
3|Sanguine Watcher|Кровавый страж|CF 174
3|Seeing with the Sky's Eyes|Глазами неба|BS 67
3|Seeking Tiamat|В поисках Тиамат|BS 68
3|Sleep of Judas|Сон Иуды|LSR 77
3|Soul of the Hemonculus|Душа гемункула|BS 68
3|Stone of the True Form|Камень истинного облика|BS 68
3|The Unseen Change|Незримая перемена|CF 172
3|Trespass|Проникновение|BS 69
3|Viral Haruspex|Вирусная гаруспиция|BS 69
3|Ward against Lupines|Защитная печать от люпинов|CB 279
3|Warding Circle against Spirits|Защитный круг от духов|CB 279
4|Balm of Bathory|Бальзам Батори|TF 94
4|Compel the Inanimate|Повелевать неживым|BS 69
4|Defense of the Sacred Haven|Защита священного убежища|CB 279
4|Egregore Consultation|Совет эгрегора|BS 70
4|Eyes of the Nighthawk|Глаза ночного ястреба|CB 279
4|Feast of Ashes|Пир пепла|PG 101
4|Guided Memory|Направленное воспоминание|PG 101
4|Incorporeal Passage|Бесплотный проход|CB 280
4|Innocence of the Child's Heart|Невинность детского сердца|CF 172
4|Innocence's Veil|Покров невинности|GW 48
4|Invisible Chains of Binding|Незримые цепи|PG 102
4|Land's Sustenance|Питание земли|BS 70
4|Rending the Sweet Earth|Разверзнуть землю|CF 173
4|Riding the Earth's Vein|Верхом на жиле земли|BS 71
4|Protean Curse|Проклятие изменчивости|CF 173
4|Ward against Cainites|Защитная печать от каинитов|CB 280
4|Warding Circle against Lupines|Защитный круг от люпинов|CB 280
4|Seek the Gathered Vitae|Найти собранное витэ|LSC 29
5|Antebrachia Ignium|Огненные руки|CBG 67; PG 102
5|Atrocity's Release|Освобождение злодеяния|GW 49
5|Dominion|Владычество|PG 103
5|Eden's Bounty|Щедрость Эдема|CBG 56
5|Elemental Attack|Атака стихий|BS 71
5|Escape to True Sanctuary|Бегство в истинное убежище|CB 280
5|Fisher King|Король-рыбак|BS 72
5|Heart of Stone|Каменное сердце|CB 281
5|Reawakened Vigor|Возрождённая сила|GW 49
5|Shaft of Belated Dissolution|Стрела запоздалого распада|CB 281
5|Simulacrum Gate|Врата симулякра|SBH 51
5|Transferring the Soul|Перенос души|FOL 11-13
5|Warding Circle against Cainites|Защитный круг от каинитов|CB 282
5|Foundation of the Chantry|Основание капеллы|CD 216-217`;
const CER_SRC=`1|Gift of False Life|Дар ложной жизни|CBG 208; PG 92
1|Knowing Stone|Знающий камень|FOL 264
1|Summon Spirit|Призвание духа|CBG 209; PG 92
1|Traveler's Call|Зов путника|CBG 93
2|Ashen Relic|Пепельная реликвия|BNA 35
2|Awaken the Homuncular Servant|Слуга гомункул|CBG 209; PG 93
2|Blinding the Alloy Eye|Ослепить стальной глаз|SBH 52
2|Compel Spirit|Подчинение призрака|CBG 210; PG 94
2|Maw of Ahriman|Пасть Аримана|BSL 152
3|Create Corpse Suit|Костюм из трупа|TF 101
3|Create Flesh Golem|Голем из плоти|TF 101
3|Fortezza Sindonica|Крепость Плащаницы|TAB 173
3|Harrowhaunt|Терзающий призрак|SBH 51
3|Host Spirit|Вселение духа|CBG 211; PG 94
3|Knit the Veil|Заштопать Саван|TAB 174
3|Name of the Father|Имя отца|CBG 94
3|Shallow Slumber|Чуткий сон|GW 50
3|Shambling Hordes|Шаркающие орды|CBG 212; PG 95
3|Wisdom of the Dead|Мудрость мёртвых|BNA 35
3|Misfortune's Hand|Рука несчастья|CD 217
4|Befoul Vessel|Осквернить сосуд|SBH 52
4|Bind the Spirit|Сковать духа|CBG 212; PG 96
4|Bind to Mortal Form|Привязать к смертному телу|TF 102
4|Death Rattle|Предсмертный хрип|TAB 174
4|Split the Veil|Рассечь Саван|CBG 213; PG 96
5|Ex Nihilo|Из ничего|CBG 213
5|Gift of True Life|Дар истинной жизни|TF 102
5|Lazarene Blessing|Благословение Лазаря|CBG 214; PG 96
5|Pit of Contemplation|Яма созерцания|CBG 94`;
const parseRites=(t,pre,attr,disc)=>t.trim().split('\n').map((x,i)=>{const [l,en,n,src,a]=x.split('|');return {id:pre+i,l:+l,en,n,src:src||'',pool:[[a||attr,disc]]}});
VTM.RITUALS=parseRites(RIT_SRC,'rit',  'int','bloodsorcery');
VTM.CEREMONIES=parseRites(CER_SRC,'cer','res','oblivion');
VTM.RITE={};[...VTM.RITUALS,...VTM.CEREMONIES].forEach(r=>VTM.RITE[r.id]=r);

/* кланы: дисциплины, изъян, побуждение */
VTM.CLANS={
  brujah:{n:'Бруха',d:['celerity','potence','presence'],bane:'Бурлящая ярость: штраф к сопротивлению Ярости, равный тяжести изъяна.',comp:'Бунтарство: действует против любого приказа или ожидания.',src:'CB 67'},
  gangrel:{n:'Гангрел',d:['animalism','fortitude','protean'],bane:'Звериные черты: в Ярости получают звериные черты — штраф, равный тяжести изъяна.',comp:'Звериные инстинкты: решает проблемы как животное.',src:'CB 71'},
  malkavian:{n:'Малкавиан',d:['auspex','dominate','obfuscate'],bane:'Безумие: при Голоде или стрессе — психическое расстройство, штраф равный тяжести изъяна.',comp:'Бред: видит знаки и смыслы там, где их нет.',src:'CB 75'},
  nosferatu:{n:'Носферату',d:['animalism','obfuscate','potence'],bane:'Уродство: не могут сойти за людей; недостаток «Омерзительный».',comp:'Криптофилия: одержимость тайнами.',src:'CB 79'},
  toreador:{n:'Тореадор',d:['auspex','celerity','presence'],bane:'Эстеты: в некрасивом окружении — штраф, равный тяжести изъяна.',comp:'Одержимость: прекрасное захватывает целиком.',src:'CB 83'},
  tremere:{n:'Тремер',d:['auspex','bloodsorcery','dominate'],bane:'Ослабленная кровь: не могут наложить Кровные узы на сородичей.',comp:'Перфекционизм: всё должно быть безупречно.',src:'CB 87'},
  ventrue:{n:'Вентру',d:['dominate','fortitude','presence'],bane:'Взыскательность: пьют кровь только определённой жертвы.',comp:'Высокомерие: требует подчинения.',src:'CB 91'},
  banuhaqim:{n:'Бану Хаким',d:['bloodsorcery','celerity','obfuscate'],bane:'Кровожадность: от крови сородича трудно оторваться.',comp:'Суд: наказывает нарушившего правила.',src:'CBG 112; PG 23'},
  ministry:{n:'Министерство',d:['obfuscate','presence','protean'],bane:'Отвращение к свету: штраф при ярком свете, больше урона от солнца.',comp:'Искушение: толкает других к пороку.',src:'CBG 77; PG 40'},
  lasombra:{n:'Ласомбра',d:['dominate','oblivion','potence'],bane:'Искажённое отражение: не отражаются в зеркалах, искажаются на записях и в технике.',comp:'Безжалостность: цель любой ценой.',src:'CBN 291; PG 36'},
  hecata:{n:'Геката',d:['auspex','fortitude','oblivion'],bane:'Мучительный поцелуй: укус причиняет боль, жертвы сопротивляются.',comp:'Морбидность: тяга к смерти и умершим.',src:'CBG 197; PG 30'},
  ravnos:{n:'Равнос',d:['animalism','obfuscate','presence'],bane:'Обречённые: днёвка на одном месте подряд — урон огнём.',comp:'Искушение судьбой: ищет риска.',src:'CMP 6; PG 44'},
  salubri:{n:'Салюбри',d:['auspex','dominate','fortitude'],bane:'Желанная кровь и третий глаз: кровь привлекает сородичей, глаз кровоточит при силах.',comp:'Сострадание: должен помочь страдающему.',src:'CMP 12; PG 48'},
  tzimisce:{n:'Цимисхи',d:['animalism','dominate','protean'],bane:'Привязанность к земле: днём нужно лежать на своей земле.',comp:'Собственничество: присваивает людей и вещи.',src:'CMP 16; PG 52'},
  caitiff:{n:'Каитифф',d:[],any:true,bane:'Изгои: недостаток «Подозрительный», опыт на дисциплины ×6.',comp:'—',src:'CB 103'},
  thinblood:{n:'Слабокровные',d:['alchemy'],thin:true,bane:'Нет кланового изъяна и клановых дисциплин; выносят солнце, могут есть пищу.',comp:'—',src:'CB 105'},
};
/* стили охоты (Predator types): все официальные */
VTM.PREDATORS={
  alleycat:{n:'Налётчик',en:'Alleycat',src:'CB 175',pool:['str','brawl'],pool2:['wit','streetwise'],spec:[['intimidation','Грабёж'],['brawl','Захваты']],disc:['celerity','potence'],hum:-1,adv:[['Контакты (преступный мир)',3,false]]},
  bagger:{n:'Суррогатчик',en:'Bagger',src:'CB 176',pool:['int','streetwise'],spec:[['larceny','Взлом замков'],['streetwise','Чёрный рынок']],disc:['bloodsorcery','oblivion','obfuscate'],discNote:'Кровавое чародейство — Тремер и Бану Хаким, Обливион — Геката',adv:[['Крепкий желудок',3,false],['Враг',2,true]],noClans:['ventrue']},
  bloodleech:{n:'Кровавая пиявка',en:'Blood Leech',src:'CB 176',pool:null,spec:[['brawl','Сородичи'],['stealth','Против сородичей']],disc:['celerity','protean'],hum:-1,bp:1,adv:[['Страшная тайна: диаблерист (или Изгой)',2,true],['Разборчивость в добыче: смертные',2,true]]},
  cleaver:{n:'Семьянин',en:'Cleaver',src:'CB 176',pool:['man','subterfuge'],spec:[['persuasion','Газлайтинг'],['subterfuge','Сокрытие следов']],disc:['dominate','animalism'],adv:[['Страшная тайна: Семьянин',1,true],['Стадо',2,false]]},
  consensualist:{n:'Джентльмен',en:'Consensualist',src:'CB 177',pool:['man','persuasion'],spec:[['medicine','Флеботомия'],['persuasion','Доноры']],disc:['auspex','fortitude'],hum:1,adv:[['Страшная тайна: нарушитель Маскарада',1,true],['Разборчивость в добыче: без согласия',1,true]]},
  farmer:{n:'Фермер',en:'Farmer',src:'CB 177',pool:['com','animalken'],spec:[['animalken','Конкретное животное'],['survival','Охота']],disc:['animalism','protean'],hum:1,adv:[['Фермер',2,true]],noClans:['ventrue'],maxBp:2},
  osiris:{n:'Идол',en:'Osiris',src:'CB 177',pool:['man','subterfuge'],spec:[['occult','Своя традиция'],['performance','Своя сфера']],disc:['bloodsorcery','presence'],discNote:'Кровавое чародейство — Тремер и Бану Хаким',adv:[['Слава и/или Стадо (распределить 3)',3,false],['Враги и/или мифические недостатки (распределить 2)',2,true]]},
  sandman:{n:'Морфей',en:'Sandman',src:'CB 177',pool:['dex','stealth'],spec:[['medicine','Анестетики'],['stealth','Проникновение']],disc:['auspex','obfuscate'],adv:[['Ресурсы',1,false]]},
  scenequeen:{n:'Тусовщик',en:'Scene Queen',src:'CB 178',pool:['man','persuasion'],spec:[['etiquette','Своя тусовка'],['leadership','Своя тусовка'],['streetwise','Своя тусовка']],disc:['dominate','potence'],adv:[['Слава',1,false],['Контакты',1,false],['Непопулярный или Разборчивость в добыче (другая субкультура)',1,true]]},
  siren:{n:'Искуситель',en:'Siren',src:'CB 178',pool:['cha','subterfuge'],spec:[['persuasion','Соблазнение'],['subterfuge','Соблазнение']],disc:['fortitude','presence'],adv:[['Красота',2,false],['Враг: отвергнутый любовник',1,true]]},
  extortionist:{n:'Вымогатель',en:'Extortionist',src:'CBG 150; PG 107',pool:['str','intimidation'],pool2:['man','intimidation'],spec:[['intimidation','Принуждение'],['larceny','Охранные системы']],disc:['dominate','potence'],adv:[['Контакты и/или Ресурсы (распределить 3)',3,false],['Враг: полиция или сбежавшая жертва',2,true]]},
  graverobber:{n:'Расхититель могил',en:'Graverobber',src:'CBG 150; PG 107',pool:['res','medicine'],pool2:['man','insight'],spec:[['occult','Погребальные обряды'],['medicine','Трупы']],disc:['fortitude','oblivion'],adv:[['Крепкий желудок',3,false],['Убежище',1,false],['Очевидный хищник',2,true]]},
  roadsidekiller:{n:'Придорожный убийца',en:'Roadside Killer',src:'LSR 76; LSC 26',pool:['dex','drive'],pool2:['cha','drive'],spec:[['survival','Дорога'],['investigation','Жаргон вампиров']],disc:['fortitude','protean'],adv:[['Кочующее стадо',2,false],['Разборчивость в добыче: местные',1,true]]},
  grimreaper:{n:'Жнец',en:'Grim Reaper',src:'PG 108',pool:['int','awareness'],pool2:['int','medicine'],spec:[['awareness','Смерть'],['larceny','Подделка документов']],disc:['auspex','oblivion'],hum:1,adv:[['Союзники или Влияние (медицина)',1,false],['Разборчивость в добыче: здоровые смертные',1,true]]},
  montero:{n:'Монтеро',en:'Montero',src:'PG 108',pool:['int','stealth'],pool2:['res','stealth'],spec:[['leadership','Охотничья свора'],['stealth','Засада']],disc:['dominate','obfuscate'],hum:-1,adv:[['Слуги',2,false]]},
  pursuer:{n:'Преследователь',en:'Pursuer',src:'PG 108',pool:['int','investigation'],pool2:['sta','stealth'],spec:[['investigation','Составление профиля'],['stealth','Слежка']],disc:['animalism','auspex'],hum:-1,adv:[['Ищейка',1,false],['Контакты (беспринципные)',1,false]]},
  trapdoor:{n:'Домосед',en:'Trapdoor',src:'PG 108-109',pool:['cha','stealth'],pool2:['dex','stealth'],spec:[['persuasion','Реклама'],['stealth','Засады и ловушки']],disc:['protean','obfuscate'],adv:[['Убежище',1,false],['Слуги, Стадо или ещё точка Убежища',1,false],['Жуткое убежище или Убежище с призраками',1,true]]},
  tithecollector:{n:'Сборщик десятины',en:'Tithe Collector',src:'IM 17-18',pool:null,spec:[['intimidation','Сородичи'],['leadership','Сородичи']],disc:['dominate','presence'],adv:[['Домен или Статус (распределить 3)',3,false],['Противник',2,true]],note:'Для анцилл'},
};
/* таблица поколений (Основная книга, с. 213) */
VTM.GEN_BP={4:[5,10],5:[4,9],6:[3,8],7:[3,7],8:[2,6],9:[2,5],10:[1,4],11:[1,4],12:[1,3],13:[1,3],14:[0,0],15:[0,0],16:[0,0]};
VTM.GENERATIONS=[4,5,6,7,8,9,10,11,12,13,14,15,16].map(g=>[g,`${g}-е${g>=14?' (слабая кровь)':g<=5?' (мафусаил)':g<=9?' (старейшина)':''}`,VTM.GEN_BP[g][0]]);
VTM.AGES={
  childer:{n:'Птенцы',d:'обращены за последние 15 лет',gen:[13,12],xp:0},
  neonate:{n:'Неонаты',d:'обращены между 1940 годом и прошлым десятилетием',gen:[13,12],xp:15},
  ancilla:{n:'Анциллы',d:'обращены между 1780 и 1940 годами',gen:[11,10],xp:35,adv:2,flaw:2,hum:-1},
  elder:{n:'Старейшины',d:'VI–IX поколения, обращены задолго до современности (только мастер)',gen:[9,8,7,6],xp:0,gm:true,adv:2,flaw:2,hum:-1},
  methuselah:{n:'Мафусаилы',d:'IV–V поколения, тысячелетние вампиры (только мастер)',gen:[5,4],xp:0,gm:true,adv:2,flaw:2,hum:-2},
};
/* Сила крови (Основная книга, с. 216; прилив и тяжесть изъяна — с поправкой Companion, с. 61): [прилив, лечение, бонус к дисциплинам, переброс пробуждения до уровня, тяжесть изъяна] */
VTM.BP=[[1,1,0,0,0],[2,1,0,1,2],[2,2,1,1,2],[3,2,1,2,3],[3,3,2,2,3],[4,3,2,3,4],[4,3,3,3,4],[5,3,3,4,5],[5,4,4,4,5],[6,4,4,5,6],[6,5,5,5,6]];
VTM.BP_FEED=['Без штрафа','Без штрафа','Кровь животных и из пакетов утоляет вдвое меньше Голода','Кровь животных и из пакетов не утоляет Голод','Кровь животных и пакетов не утоляет; от человека на 1 Голода меньше','Как 4; чтобы опустить Голод ниже 2, нужно осушить и убить человека','Как 5','От человека на 2 Голода меньше; ниже 2 — только убив','Кровь животных и пакетов не утоляет; ниже 2 — только убив','От человека на 2 меньше; ниже 3 — только убив','От человека на 3 меньше; ниже 3 — только убив'];

/* каталог достоинств, недостатков и фактов биографии: [кат, ru, en, точки (массив допустимых), недостаток?, повторяемое?, источник] */
const _vM=(cat,n,en,dots,flaw,rep,src)=>({cat,n,en,dots,flaw:!!flaw,rep:!!rep,src:src||'CB'});
const _vR=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
VTM.MERITS=[
  _vM('Факты биографии','Союзники','Allies',_vR(1,6),0,1,'CB 184'),_vM('Факты биографии','Контакты','Contacts',_vR(1,3),0,1,'CB 185'),_vM('Факты биографии','Слава','Fame',_vR(1,5),0,0,'CB 186'),
  _vM('Факты биографии','Убежище','Haven',_vR(1,3),0,1,'CB 189'),_vM('Факты биографии','Стадо','Herd',_vR(1,5),0,0,'CB 190'),_vM('Факты биографии','Влияние','Influence',_vR(1,5),0,1,'CB 187'),
  _vM('Факты биографии','Маска','Mask',_vR(1,2),0,0,'CB 191'),_vM('Факты биографии','Мавла (покровитель)','Mawla',_vR(1,5),0,1,'CB 192'),_vM('Факты биографии','Ресурсы','Resources',_vR(1,5),0,0,'CB 193'),
  _vM('Факты биографии','Слуги','Retainers',_vR(1,3),0,1,'CB 193'),_vM('Факты биографии','Статус','Status',_vR(1,5),0,1,'CB 194'),
  _vM('Убежище','Тайный арсенал','Hidden Armory',_vR(1,5),0,0,'CB 190'),_vM('Убежище','Клетка','Cell',_vR(1,3),0,0,'CB 190'),_vM('Убежище','Наблюдатели','Watchmen',_vR(1,3),0,0,'CB 190'),
  _vM('Убежище','Лаборатория','Laboratory',_vR(1,3),0,0,'CB 190'),_vM('Убежище','Библиотека','Library',_vR(1,3),0,0,'CB 190'),_vM('Убежище','Чёрный ход','Postern',_vR(1,3),0,0,'CB 190'),
  _vM('Убежище','Охранная система','Security System',_vR(1,3),0,0,'CB 190'),_vM('Убежище','Операционная','Surgery',[1],0,0,'CB 190'),_vM('Убежище','Защитные печати','Warding',_vR(1,3),0,0,'CB 190'),
  _vM('Маска','Обнулённый','Zeroed',[1],0,0,'CB 191'),_vM('Маска','Сапожник (подделка документов)','Cobbler',[1],0,0,'CB 191'),
  _vM('Внешность','Красота','Beautiful',[2],0,0,'CB 180'),_vM('Внешность','Ослепительная внешность','Stunning',[4],0,0,'CB 180'),
  _vM('Прочее','Полиглот','Linguistics',_vR(1,5),0,0,'CB 180'),_vM('Зависимости','Функциональная зависимость','High-Functioning Addict',[1],0,0,'CB 181'),
  _vM('Узы','Сопротивление узам','Bond Resistance',_vR(1,3),0,0,'CB 182'),_vM('Узы','Короткие узы','Short Bond',[2],0,0,'CB 182'),_vM('Узы','Неподвластный узам','Unbondable',[5],0,0,'CB 182'),
  _vM('Питание','Ищейка','Bloodhound',[1],0,0,'CB 182'),_vM('Питание','Крепкий желудок','Iron Gullet',[3],0,0,'CB 182'),_vM('Мифические','Есть пищу','Eat Food',[2],0,0,'CB 182'),
  _vM('Слабая кровь','Товарищи-анархи','Anarch Comrades',[1],0,0,'CB 183'),_vM('Слабая кровь','Контакт в Камарилье','Camarilla Contact',[1],0,0,'CB 183'),_vM('Слабая кровь','Цепная кровь','Catenating Blood',[1],0,0,'CB 183'),
  _vM('Слабая кровь','Дневной питух','Day Drinker',[1],0,0,'CB 183'),_vM('Слабая кровь','Родство с дисциплиной','Discipline Affinity',[1],0,0,'CB 183'),_vM('Слабая кровь','Как живой','Lifelike',[1],0,0,'CB 183'),
  _vM('Слабая кровь','Алхимик слабой крови','Thin-blood Alchemist',[1],0,0,'CB 183'),_vM('Слабая кровь','Вампирская живучесть','Vampiric Resilience',[1],0,0,'CB 183'),
  // недостатки
  _vM('Факты биографии','Враг','Enemy',_vR(1,4),1,1,'CB 184'),_vM('Факты биографии','Противник','Adversary',_vR(1,5),1,1,'CB 192'),_vM('Факты биографии','Дурная слава','Infamy',_vR(1,2),1,0,'CB 186'),
  _vM('Факты биографии','Страшная тайна','Dark Secret',_vR(1,2),1,1,'CB 186'),_vM('Факты биографии','Презираемый','Despised',[2],1,0,'CB 188'),_vM('Факты биографии','Непопулярный','Disliked',[1],1,0,'CB 188'),
  _vM('Убежище','Нет убежища','No Haven',[1],1,0,'CB 189'),_vM('Убежище','Скомпрометированное убежище','Compromised',[2],1,0,'CB 190'),_vM('Убежище','Жуткое убежище','Creepy',[1],1,0,'CB 190'),_vM('Убежище','Убежище с призраками','Haunted',[1],1,0,'CB 190'),
  _vM('Факты биографии','Очевидный хищник','Obvious Predator',[2],1,0,'CB 190'),_vM('Маска','Известная «пустышка»','Known Blankbody',[2],1,0,'CB 191'),_vM('Маска','Известный покойник','Known Corpse',[1],1,0,'CB 191'),
  _vM('Факты биографии','Нищий','Destitute',[1],1,0,'CB 193'),_vM('Факты биографии','Сталкеры','Stalkers',[1],1,0,'CB 193'),_vM('Факты биографии','Изгой','Shunned',[2],1,1,'CB 194'),_vM('Факты биографии','Подозрительный','Suspect',[1],1,1,'CB 194'),
  _vM('Прочее','Неграмотный','Illiterate',[2],1,0,'CB 180'),_vM('Внешность','Омерзительный','Repulsive',[2],1,0,'CB 180'),_vM('Внешность','Уродливый','Ugly',[1],1,0,'CB 180'),
  _vM('Зависимости','Безнадёжная зависимость','Hopeless Addiction',[2],1,0,'CB 181'),_vM('Зависимости','Зависимость','Addiction',[1],1,0,'CB 181'),
  _vM('Прочее','Архаичный','Archaic',[2],1,0,'CB 181'),_vM('Прочее','Живущий прошлым','Living in the Past',[1],1,0,'CB 181'),
  _vM('Узы','Раб уз','Bondslave',[2],1,0,'CB 181'),_vM('Узы','Наркоман уз','Bond Junkie',[1],1,0,'CB 181'),_vM('Узы','Долгие узы','Long Bond',[1],1,0,'CB 182'),
  _vM('Питание','Веган','Vegan',[2],1,0,'CB 182'),_vM('Питание','Органофаг','Organovore',[2],1,0,'CB 182'),_vM('Питание','Жажда Мафусаила','Methuselah\'s Thirst',[1],1,0,'CB 182'),_vM('Питание','Разборчивость в добыче','Prey Exclusion',[1],1,1,'CB 182'),_vM('Питание','Фермер','Farmer',[2],1,0,'CB 182'),
  _vM('Мифические','Приманка для кола','Stake Bait',[2],1,0,'CB 182'),_vM('Мифические','Фольклорная погибель','Folkloric Bane',[1],1,1,'CB 182'),_vM('Мифические','Фольклорный запрет','Folkloric Block',[1],1,1,'CB 182'),_vM('Мифические','Стигматы','Stigmata',[1],1,0,'CB 182'),
  _vM('Слабая кровь','Молочные зубы','Baby Teeth',[1],1,0,'CB 182'),_vM('Слабая кровь','Звериный нрав','Bestial Temper',[1],1,0,'CB 182'),_vM('Слабая кровь','Клеймо Камарильи','Branded by the Camarilla',[1],1,0,'CB 182'),
  _vM('Слабая кровь','Клановое проклятие','Clan Curse',[1],1,0,'CB 182'),_vM('Слабая кровь','Мёртвая плоть','Dead Flesh',[1],1,0,'CB 182'),_vM('Слабая кровь','Смертная хрупкость','Mortal Frailty',[1],1,0,'CB 182'),
  _vM('Слабая кровь','Изгой у анархов','Shunned by the Anarchs',[1],1,0,'CB 182'),_vM('Слабая кровь','Зависимость от витэ','Vitae Dependency',[1],1,0,'CB 182'),
];
VTM.MERIT=Object.fromEntries(VTM.MERITS.map((m,i)=>[m.n,m]));

/* ---------- вычисления по листу ---------- */
VTM.blank=()=>({name:'',concept:'',clan:'',sire:'',predator:'',gen:13,bp:1,age:'neonate',ambition:'',desire:'',chronicle:'',
  attr:{str:1,dex:1,sta:1,cha:1,man:1,com:1,int:1,wit:1,res:1},skills:{},spec:{},disc:{},powers:[],rites:[],adv:[],conv:[],
  humanity:7,stains:0,hunger:1,health:{s:0,a:0},wp:{s:0,a:0},xp:{total:0,spent:0},notes:'',spread:'balanced',cap:5});
VTM.val=(c,k)=>{if(!c)return 0;if(k in VTM.ATTR_NAME)return +(c.attr?.[k]||0);if(k in VTM.SKILL_NAME)return +(c.skills?.[k]||0);if(k in VTM.DISC)return +(c.disc?.[k]||0);if(k==='humanity')return +(c.humanity||0);if(k==='bp')return +(c.bp||0);return 0};
VTM.traitName=k=>VTM.ATTR_NAME[k]||VTM.SKILL_NAME[k]||VTM.DISC[k]||({humanity:'Человечность',bp:'Сила крови'})[k]||k;
VTM.cap=c=>Math.max(5,Math.min(10,+(c?.cap||5)));
/* по V5 дисциплины не бывают выше 5 даже у древних (сила растёт через Силу крови: бонус к броскам и +1 сила за точку выше 5 — Gehenna War).
   Выше 5 — только если мастер включил домашнее правило «Предел точек» в листе. */
VTM.discCap=c=>VTM.cap(c);
VTM.healthMax=c=>VTM.val(c,'sta')+3+((c.powers||[]).includes('resilience')?VTM.val(c,'fortitude'):0);
VTM.wpMax=c=>VTM.val(c,'com')+VTM.val(c,'res');
VTM.bpRow=c=>VTM.BP[Math.max(0,Math.min(10,+(c.bp||0)))];
VTM.baneSeverity=c=>VTM.bpRow(c)[4];
VTM.extraPowers=c=>Math.max(0,(+c.bp||0)-5); // Gehenna War: дополнительная сила за каждую точку Силы крови выше 5
VTM.powerSlots=(c,disc)=>VTM.val(c,disc);
VTM.amalgamOk=(c,p)=>!p.am||VTM.val(c,p.am.d)>=p.am.v;
VTM.impair=c=>{const hm=VTM.healthMax(c),h=(c.health?.s||0)+(c.health?.a||0);const wm=VTM.wpMax(c),w=(c.wp?.s||0)+(c.wp?.a||0);return {phys:h>=hm,mind:w>=wm}};
VTM.check=c=>{
  const out=[];const a=Object.values(c.attr||{}).map(Number).sort((x,y)=>y-x);
  out.push([JSON.stringify(a)===JSON.stringify(VTM.ATTR_SPREAD),'Атрибуты: один на 4, три на 3, четыре на 2, один на 1',`сейчас: ${a.join(' ')}`]);
  const sp=VTM.SKILL_SPREADS[c.spread]||VTM.SKILL_SPREADS.balanced;const cnt={};Object.values(c.skills||{}).forEach(v=>{if(v>0)cnt[v]=(cnt[v]||0)+1});
  out.push([Object.keys({...sp.d,...cnt}).every(k=>(sp.d[k]||0)===(cnt[k]||0)),'Навыки: '+sp.name+' ('+sp.hint+')',Object.keys(cnt).sort((x,y)=>y-x).map(k=>`${cnt[k]}×${k}`).join(', ')||'нет']);
  const clan=VTM.CLANS[c.clan];
  if(!clan)out.push([false,'Выберите клан','']);
  else if(!clan.thin){const tot=Object.values(c.disc||{}).reduce((s,v)=>s+ +v,0);
    out.push([tot===(VTM.PREDATORS[c.predator]?4:3),'Дисциплины: 2 + 1 клановые и 1 от стиля охоты',`всего точек: ${tot}`]);
    const pw=(c.powers||[]).length;out.push([pw===tot+VTM.extraPowers(c),'Силы: по одной на точку дисциплины'+(VTM.extraPowers(c)?` + ${VTM.extraPowers(c)} за Силу крови выше 5`:''),`выбрано ${pw} из ${tot+VTM.extraPowers(c)}`])}
  out.push([!!c.predator,'Стиль охоты выбран',VTM.PREDATORS[c.predator]?.n||'']);
  const ag=VTM.AGES[c.age]||{};const adv=(c.adv||[]).filter(x=>!x.flaw&&!x.pred).reduce((s,x)=>s+ +x.dots,0),fl=(c.adv||[]).filter(x=>x.flaw&&!x.pred).reduce((s,x)=>s+ +x.dots,0);
  out.push([adv===7+(ag.adv||0),`Достоинства: ${7+(ag.adv||0)} точек`,`потрачено ${adv}`]);out.push([fl===2+(ag.flaw||0),`Недостатки: ${2+(ag.flaw||0)} точки (кроме стиля охоты)`,`взято ${fl}`]);
  const dup=VTM.dupMerits(c.adv||[]);out.push([!dup.length,'Без повторов неповторяемых достоинств и недостатков',dup.join(', ')]);
  out.push([(c.conv||[]).length>=1&&(c.conv||[]).length<=3,'Принципы и опоры: от 1 до 3',`${(c.conv||[]).length}`]);
  const g=VTM.GEN_BP[+c.gen];if(g)out.push([+c.bp>=g[0]&&+c.bp<=g[1],`Сила крови в пределах поколения (${g[0]}–${g[1]})`,`сейчас ${c.bp}`]);
  return out;
};
VTM.dupMerits=adv=>{const seen={},d=[];for(const a of adv){const m=VTM.MERIT[a.n];if(!a.n||(m&&m.rep))continue;const k=a.n.trim().toLowerCase();if(seen[k])d.push(a.n);seen[k]=1}return [...new Set(d)]};

/* ---------- движок бросков V5 ---------- */
VTM.d10=()=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%10+1};
VTM.score=(reg,hun,diff)=>{
  const all=[...reg.map(v=>({v,h:0})),...hun.map(v=>({v,h:1}))];
  let succ=all.filter(d=>d.v>=6).length;const tens=all.filter(d=>d.v===10),pairs=Math.floor(tens.length/2);succ+=pairs*2;
  const d=diff||0;const win=d?succ>=d:succ>0;let res=win?'win':'fail';
  if(win&&pairs>0)res=hun.includes(10)?'messy':'crit';
  if(!win&&hun.includes(1))res='bestial';
  if(!win&&succ===0&&!hun.includes(1))res='total';
  return {succ,pairs,res,margin:d?succ-d:null};
};
VTM.roll=({pool,hunger=0,diff=0})=>{
  pool=Math.max(1,pool|0);const h=Math.min(pool,Math.max(0,hunger|0));
  const reg=[],hun=[];for(let i=0;i<pool-h;i++)reg.push(VTM.d10());for(let i=0;i<h;i++)hun.push(VTM.d10());
  return {reg,hun,...VTM.score(reg,hun,diff)};
};
VTM.RES={win:['Успех','#7ad08a'],fail:['Провал','#b9b3a6'],total:['Полный провал','#d07a7a'],crit:['Триумф','#ffd36a'],messy:['Кровавый триумф','#ff4d4d'],bestial:['Кровавый провал','#ff4d4d']};
VTM.RES_HINT={messy:'Зверь берёт своё: успех достигнут, но жестоко и безрассудно — возможно Побуждение.',bestial:'Зверь вырывается наружу: провал с последствиями от Голода — Побуждение или безрассудство.',crit:'Блестящий результат.',total:'Ни одного успеха.'};
/* старые id сил из прошлых версий приложения */
Object.entries({mask_thousand_faces:'mask_thousand',obeah:'panacea',where_shroud_thins:'where_veil_thins',profane_hieros_gamos:'profane_hieros'}).forEach(([o,n])=>{VTM.POWER[o]=VTM.POWER[n]});
