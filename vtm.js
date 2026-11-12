/* RPAssistant — Vampire: The Masquerade 5th Edition: данные для листа персонажа и движок бросков.
   Названия по русской локализации V5; механика — по корбуку V5 и Companion. */
const VTM={};

VTM.ATTRS=[
  ['physical','Физические',[['str','Сила'],['dex','Ловкость'],['sta','Выносливость']]],
  ['social','Социальные',[['cha','Обаяние'],['man','Манипулирование'],['com','Самообладание']]],
  ['mental','Ментальные',[['int','Интеллект'],['wit','Смекалка'],['res','Решимость']]],
];
VTM.SKILLS=[
  ['physical','Физические',[['athletics','Атлетика'],['brawl','Драка'],['craft','Ремесло'],['drive','Вождение'],['firearms','Стрельба'],['larceny','Воровство'],['melee','Ближний бой'],['stealth','Скрытность'],['survival','Выживание']]],
  ['social','Социальные',[['animalken','Обращение с животными'],['etiquette','Этикет'],['insight','Проницательность'],['intimidation','Запугивание'],['leadership','Лидерство'],['performance','Исполнение'],['persuasion','Убеждение'],['streetwise','Знание улиц'],['subterfuge','Хитрость']]],
  ['mental','Ментальные',[['academics','Гуманитарные науки'],['awareness','Внимательность'],['finance','Финансы'],['investigation','Расследование'],['medicine','Медицина'],['occult','Оккультизм'],['politics','Политика'],['science','Естественные науки'],['technology','Технологии']]],
];
VTM.ATTR_NAME={};VTM.ATTRS.forEach(g=>g[2].forEach(([k,n])=>VTM.ATTR_NAME[k]=n));
VTM.SKILL_NAME={};VTM.SKILLS.forEach(g=>g[2].forEach(([k,n])=>VTM.SKILL_NAME[k]=n));
VTM.ATTR_SPREAD=[4,3,3,3,2,2,2,2,1];
VTM.SKILL_SPREADS={
  jack:{name:'Мастер на все руки',hint:'1 навык на 3, 8 на 2, 10 на 1',d:{3:1,2:8,1:10}},
  balanced:{name:'Сбалансированный',hint:'3 навыка на 3, 5 на 2, 7 на 1',d:{3:3,2:5,1:7}},
  specialist:{name:'Специалист',hint:'1 навык на 4, 3 на 3, 3 на 2, 3 на 1',d:{4:1,3:3,2:3,1:3}},
};
VTM.FREE_SPEC_SKILLS=['academics','craft','performance','science']; // бесплатная специализация, если есть хотя бы 1 точка

VTM.DISC={
  animalism:'Анимализм',auspex:'Прорицание',bloodsorcery:'Чары крови',celerity:'Стремительность',dominate:'Доминирование',
  fortitude:'Стойкость',obfuscate:'Затемнение',oblivion:'Забвение',potence:'Мощь',presence:'Присутствие',protean:'Превращение',alchemy:'Алхимия слабой крови',
};
VTM.DISC_ICON={animalism:'🐺',auspex:'👁️',bloodsorcery:'🩸',celerity:'⚡',dominate:'🌀',fortitude:'🛡️',obfuscate:'🌫️',oblivion:'🌑',potence:'💪',presence:'👑',protean:'🦇',alchemy:'⚗️'};

/* сила дисциплины: [id, уровень, название, затраты (кол-во Rouse), пул [[черта,черта],…] или null, против, кратко, амальгама] */
const P=(id,l,n,r,pool,vs,d,am)=>({id,l,n,r,pool,vs,d,am});
VTM.POWERS={
  animalism:[
    P('bond_famulus',1,'Связь с фамулусом',0,[['cha','animalken']],'','Животное становится вашим фамулусом и понимает простые команды.'),
    P('sense_beast',1,'Чутьё Зверя',0,[['res','animalism']],'Самообладание + Хитрость','Чувствует враждебность и Зверя в существах.'),
    P('feral_whispers',2,'Звериный шёпот',1,[['man','animalism'],['cha','animalism']],'','Разговор с животными, призыв их на помощь.'),
    P('animal_succulence',3,'Животная сочность',0,null,'','Кровь животных утоляет Голод лучше.'),
    P('quell_beast',3,'Усмирение Зверя',1,[['cha','animalism']],'Выносливость + Решимость','Подавляет Зверя/порывы цели.'),
    P('unliving_hive',3,'Неживой улей',0,null,'','Рои насекомых как фамулус.','Затемнение 2'),
    P('subsume_spirit',4,'Поглощение духа',1,[['man','animalism']],'','Переносит разум в тело животного. Сложность 4.'),
    P('animal_dominion',5,'Власть над зверьём',2,[['cha','animalism']],'','Командует стаями и роями.'),
    P('drawing_out_beast',5,'Изгнание Зверя',1,[['wit','animalism']],'Самообладание + Решимость','Переносит своё безумие на другого.'),
  ],
  auspex:[
    P('heightened_senses',1,'Обострённые чувства',0,[['wit','res']],'','Сверхострые чувства; + Прорицание к броскам восприятия.'),
    P('sense_unseen',1,'Чувство незримого',0,[['wit','auspex'],['res','auspex']],'','Замечает сверхъестественное и скрытое.'),
    P('premonition',2,'Предчувствие',0,[['res','auspex']],'','Видения и подсказки (Rouse — по желанию).'),
    P('scry_soul',3,'Взгляд в душу',1,[['int','auspex']],'Самообладание + Хитрость','Читает ауру: эмоции, природа, диаблери.'),
    P('share_senses',3,'Разделить чувства',1,[['res','auspex']],'','Смотрит чужими глазами.'),
    P('spirits_touch',4,'Касание духа',1,[['int','auspex']],'','Психометрия: чувствует прошлое предмета/места.'),
    P('clairvoyance',5,'Ясновидение',1,[['int','auspex']],'','Собирает сведения о районе.'),
    P('possession',5,'Одержимость',2,[['res','auspex']],'Решимость + Интеллект','Вселяется в тело смертного.','Доминирование 3'),
    P('telepathy',5,'Телепатия',1,[['res','auspex']],'Смекалка + Хитрость','Читает мысли, передаёт свои.'),
  ],
  bloodsorcery:[
    P('corrosive_vitae',1,'Едкое витэ',1,null,'','Кровь разъедает неживую материю.'),
    P('taste_for_blood',1,'Вкус крови',0,[['res','bloodsorcery']],'','Узнаёт по вкусу резонанс, поколение, природу.'),
    P('extinguish_vitae',2,'Гашение витэ',1,[['int','bloodsorcery']],'Выносливость + Самообладание','Усиливает Голод вампира-цели.'),
    P('blood_of_potency',3,'Кровь могущества',1,[['res','bloodsorcery']],'','Временно повышает Силу крови.'),
    P('scorpions_touch',3,'Касание скорпиона',1,[['str','bloodsorcery']],'Выносливость + Оккультизм/Стойкость','Кровь становится ядом.'),
    P('theft_of_vitae',4,'Кража витэ',1,[['wit','bloodsorcery']],'Смекалка + Оккультизм','Высасывает кровь на расстоянии.'),
    P('baals_caress',5,'Ласка Баала',1,[['str','bloodsorcery']],'Выносливость + Оккультизм/Стойкость','Смертельный яд для вампиров.'),
    P('cauldron_of_blood',5,'Котёл крови',1,[['res','bloodsorcery']],'Самообладание + Оккультизм','Кипятит кровь в жилах цели.'),
  ],
  celerity:[
    P('cats_grace',1,'Кошачья грация',0,null,'','Идеальное равновесие, без бросков Атлетики.'),
    P('rapid_reflexes',1,'Быстрые рефлексы',0,null,'','Нет штрафа к защите от нескольких противников; уклон от стрел и пуль.'),
    P('fleetness',2,'Проворство',1,null,'','+ Стремительность к защите и броскам Ловкости вне боя.'),
    P('blink',3,'Рывок',1,[['dex','athletics']],'','Мгновенно преодолевает расстояние.'),
    P('traversal',3,'Пересечение',1,[['dex','athletics']],'','Бег по стенам и воде.'),
    P('draught_elegance',4,'Глоток грации',1,null,'','Кровь даёт пьющему Стремительность.'),
    P('unerring_aim',4,'Безошибочный прицел',1,null,'','Цель стрельбы не может уклониться.','Прорицание 2'),
    P('lightning_strike',5,'Удар молнии',1,null,'','Атака, от которой нельзя защититься.'),
    P('split_second',5,'Доля секунды',1,null,'','Действует раньше, чем что-то произойдёт.'),
  ],
  dominate:[
    P('cloud_memory',1,'Затуманить память',0,[['cha','dominate']],'Смекалка + Решимость','Цель забывает последние минуты.'),
    P('compel',1,'Повеление',0,[['cha','dominate']],'Интеллект + Решимость','Короткая команда в одно действие.'),
    P('mesmerize',2,'Гипноз',1,[['man','dominate']],'Интеллект + Решимость','Сложная команда, выполняется сразу.'),
    P('dementation',2,'Безумие',1,[['man','dominate']],'Самообладание + Интеллект','Пробуждает внутренних демонов цели.','Затемнение 2'),
    P('forgetful_mind',3,'Забывчивый разум',1,[['man','dominate']],'Интеллект + Решимость','Переписывает воспоминания.'),
    P('submerged_directive',3,'Скрытый приказ',0,null,'','Команда срабатывает позже по триггеру.'),
    P('rationalize',4,'Оправдание',0,null,'','Жертва считает приказы своими решениями.'),
    P('mass_manipulation',5,'Массовое внушение',1,null,'','Приказ целой группе.'),
    P('terminal_decree',5,'Последний приказ',0,null,'','Приказы могут вести к смерти цели.'),
  ],
  fortitude:[
    P('resilience',1,'Живучесть',0,null,'','+ Стойкость к Здоровью.'),
    P('unswayable_mind',1,'Непоколебимый разум',0,null,'','+ Стойкость к сопротивлению воздействию на разум.'),
    P('toughness',2,'Крепость',1,null,'','Вычитает Стойкость из поверхностного урона.'),
    P('enduring_beasts',2,'Выносливые звери',0,[['sta','animalism']],'','Даёт Стойкость фамулусу/животным.','Анимализм 1'),
    P('defy_bane',3,'Презрение к проклятию',1,[['wit','survival']],'','Превращает тяжёлый урон в поверхностный.'),
    P('fortify_facade',3,'Укрепить разум',0,null,'','Защита мыслей от Прорицания.'),
    P('draught_endurance',4,'Глоток стойкости',1,null,'','Кровь даёт пьющему Стойкость.'),
    P('flesh_of_marble',5,'Мраморная плоть',2,null,'','Игнорирует первый источник физического урона за ход.'),
    P('prowess_from_pain',5,'Сила из боли',1,null,'','Нет штрафов от ран; урон усиливает атрибуты.'),
  ],
  obfuscate:[
    P('cloak_shadows',1,'Покров теней',0,null,'','Невидимость, пока неподвижен в тени.'),
    P('silence_death',1,'Мёртвая тишина',0,null,'','Гасит все звуки, которые издаёт вампир.'),
    P('unseen_passage',2,'Незримый путь',1,null,'','Невидимость в движении.'),
    P('ghost_machine',3,'Призрак в машине',0,null,'','Затемнение действует и на камеры.'),
    P('mask_thousand_faces',3,'Маска тысячи лиц',1,null,'','Выглядит неприметным незнакомцем.'),
    P('conceal',4,'Сокрытие',1,[['int','obfuscate']],'','Скрывает предмет.','Прорицание 3'),
    P('vanish',4,'Исчезновение',0,[['wit','obfuscate']],'Смекалка + Внимательность','Исчезает прямо на глазах.'),
    P('cloak_gathering',5,'Покров собрания',1,null,'','Скрывает спутников.'),
    P('impostors_guise',5,'Личина самозванца',1,[['wit','obfuscate'],['man','performance']],'','Принимает облик конкретного человека.'),
  ],
  oblivion:[
    P('shadow_cloak',1,'Плащ теней',0,null,'','Тени окутывают вампира: + к Скрытности и Запугиванию.'),
    P('oblivion_sight',1,'Взгляд Забвения',0,null,'','Видит во тьме и призраков.'),
    P('shadow_cast',2,'Отбросить тень',1,null,'','Создаёт область тьмы.'),
    P('where_shroud_thins',2,'Где Покров тонок',0,[['wit','oblivion']],'','Чувствует тонкость Покрова.'),
    P('arms_of_ahriman',3,'Руки Аримана',1,[['wit','oblivion']],'','Тени-щупальца хватают и бьют.'),
    P('touch_of_oblivion',3,'Касание Забвения',1,[['str','oblivion']],'Выносливость + Решимость','Иссушающее касание.'),
    P('shadow_step',4,'Шаг сквозь тень',1,null,'','Перемещение из тени в тень.'),
    P('shadow_perspective',4,'Взгляд из тени',1,null,'','Видит и слышит сквозь тени.'),
    P('tenebrous_avatar',5,'Тёмный аватар',2,null,'','Становится тенью.'),
    P('skuld_fulfilled',5,'Исполненный рок',2,[['sta','oblivion']],'Выносливость + Решимость','Возвращает цели её смертные недуги.'),
  ],
  potence:[
    P('lethal_body',1,'Смертоносное тело',0,null,'','Удары без оружия наносят тяжёлый урон смертным.'),
    P('soaring_leap',1,'Высокий прыжок',0,null,'','Прыжок на Мощь × 3 метров.'),
    P('prowess',2,'Мощь удара',1,null,'','+ Мощь к урону без оружия и к Силе.'),
    P('brutal_feed',3,'Жестокое кормление',0,null,'','Мгновенно осушает жертву.'),
    P('spark_of_rage',3,'Искра ярости',1,[['man','potence']],'','Разжигает гнев у толпы.','Присутствие 3'),
    P('uncanny_grip',3,'Сверхъестественная хватка',1,null,'','Лазает по любой поверхности.'),
    P('draught_might',4,'Глоток мощи',1,null,'','Кровь даёт пьющему Мощь.'),
    P('earthshock',5,'Землетрясение',2,null,'','Удар сбивает всех с ног.'),
    P('fist_of_caine',5,'Кулак Каина',1,null,'','Удары наносят тяжёлый урон даже вампирам.'),
  ],
  presence:[
    P('awe',1,'Благоговение',0,[['man','presence']],'Самообладание + Интеллект','+ Присутствие к Убеждению, Исполнению, Лидерству.'),
    P('daunt',1,'Устрашение',0,null,'','+ Присутствие к Запугиванию.'),
    P('lingering_kiss',2,'Затяжной поцелуй',0,null,'','Жертва жаждет нового укуса.'),
    P('dread_gaze',3,'Ужасающий взгляд',1,[['cha','presence']],'Самообладание + Решимость','Ужас, цель бежит или замирает.'),
    P('entrancement',3,'Очарование',1,[['cha','presence']],'Самообладание + Смекалка','Цель влюблена и услужлива.'),
    P('irresistible_voice',4,'Неотразимый голос',0,null,'','Доминирование действует голосом, без взгляда.','Доминирование 1'),
    P('summon',4,'Призыв',1,[['man','presence']],'Самообладание + Интеллект','Цель приходит к вампиру.'),
    P('majesty',5,'Величие',2,[['cha','presence']],'Самообладание + Решимость','Никто не смеет действовать против.'),
    P('star_magnetism',5,'Звёздный магнетизм',1,null,'','Силы Присутствия работают через экран.'),
  ],
  protean:[
    P('eyes_of_beast',1,'Глаза зверя',0,null,'','Видит в полной темноте.'),
    P('weight_feather',1,'Невесомость',0,[['wit','survival']],'','Почти ничего не весит.'),
    P('feral_weapons',2,'Звериное оружие',1,null,'','Когти и клыки: + урон.'),
    P('earth_meld',3,'Слияние с землёй',1,null,'','Погружается в землю.'),
    P('shapechange',3,'Смена облика',1,null,'','Превращается в животное своего размера.'),
    P('metamorphosis',4,'Метаморфоза',1,null,'','Превращается в любое животное.'),
    P('mist_form',5,'Облик тумана',1,null,'','Становится туманом.'),
    P('unfettered_heart',5,'Свободное сердце',0,null,'','Сердце блуждает — кол почти не берёт.'),
  ],
  alchemy:[
    P('far_reach',1,'Длинная рука',0,[['res','alchemy']],'','Телекинез.'),
    P('haze',1,'Дымка',0,null,'','Облако тумана.'),
    P('envelop',2,'Окутать',0,[['wit','alchemy']],'','Туман душит и слепит.'),
    P('profane_hieros_gamos',5,'Профанный гиерогамос',0,null,'','Меняет облик и пол.'),
  ],
};
/* силы из Companion (Обеа, Валерен, Химерия, Изменчивость…) */
VTM.POWERS.auspex.push(P('unburdening_soul',5,'Освобождение души',2,[['com','auspex']],'Человечность','Облегчает душу цели, даёт ей покой (Обеа).','Доминирование 3'),P('obeah',2,'Обеа',1,[['com','auspex']],'','Восстанавливает Силу воли цели.','Стойкость 1'));
VTM.POWERS.dominate.push(P('domitors_favor',2,'Милость господина',1,null,'','Гулям труднее восстать против хозяина.'));
VTM.POWERS.obfuscate.push(P('chimerstry',2,'Химерия',1,[['man','obfuscate']],'Самообладание + Смекалка','Краткая иллюзия одного чувства.','Присутствие 1'),P('fata_morgana',3,'Фата-моргана',1,[['man','obfuscate']],'','Сложные иллюзии.','Присутствие 2'));
VTM.POWERS.fortitude.push(P('valeren',2,'Валерен',1,[['int','fortitude']],'','Исцеляет другого вампира.','Прорицание 1'));
VTM.POWERS.protean.push(P('vicissitude',2,'Изменчивость',1,[['res','protean']],'','Лепит собственную плоть.','Доминирование 2'),P('fleshcrafting',3,'Плотеваяние',1,[['res','protean']],'Выносливость + Решимость','Лепит чужую плоть.','Доминирование 2'),P('horrid_form',4,'Ужасная форма',1,null,'','Чудовищный боевой облик.','Доминирование 2'),P('one_with_land',5,'Единство с землёй',2,null,'','Сливается с землёй домена.','Анимализм 2'));
VTM.POWERS.auspex.sort((a,b)=>a.l-b.l);VTM.POWERS.dominate.sort((a,b)=>a.l-b.l);VTM.POWERS.obfuscate.sort((a,b)=>a.l-b.l);VTM.POWERS.fortitude.sort((a,b)=>a.l-b.l);VTM.POWERS.protean.sort((a,b)=>a.l-b.l);
VTM.POWER={};for(const k in VTM.POWERS)for(const p of VTM.POWERS[k]){p.disc=k;VTM.POWER[p.id]=p}

VTM.CLANS={
  brujah:{n:'Бруха',d:['celerity','potence','presence'],bane:'Бурлящая ярость: штраф к броскам против безумия ярости, равный тяжести проклятия.',comp:'Бунт: действует против любого приказа или ожидания.'},
  gangrel:{n:'Гангрел',d:['animalism','fortitude','protean'],bane:'Звериные черты: в безумии получают черты зверя — штраф к броскам, равный тяжести проклятия.',comp:'Звериный инстинкт: решает проблемы как животное.'},
  malkavian:{n:'Малкавиан',d:['auspex','dominate','obfuscate'],bane:'Безумие: при Голоде или стрессе — психическое расстройство, штраф равный тяжести проклятия.',comp:'Бред: видит знаки и смыслы там, где их нет.'},
  nosferatu:{n:'Носферату',d:['animalism','obfuscate','potence'],bane:'Уродство: не могут сойти за людей, Внешность (Уродство) и штраф к социальным броскам.',comp:'Криптофилия: одержимость тайнами.'},
  toreador:{n:'Тореадор',d:['auspex','celerity','presence'],bane:'Эстеты: в некрасивом окружении — штраф, равный тяжести проклятия.',comp:'Очарованность: прекрасное захватывает целиком.'},
  tremere:{n:'Тремер',d:['auspex','bloodsorcery','dominate'],bane:'Ослабленная кровь: не могут создать Кровные узы; чтобы связать — нужно больше глотков.',comp:'Перфекционизм: всё должно быть безупречно.'},
  ventrue:{n:'Вентру',d:['dominate','fortitude','presence'],bane:'Взыскательность: пьют только кровь определённой жертвы.',comp:'Высокомерие: требует подчинения.'},
  banuhaqim:{n:'Бану Хаким',d:['bloodsorcery','celerity','obfuscate'],bane:'Кровожадность: от крови вампира трудно оторваться.',comp:'Суд: наказывает нарушившего правила.'},
  ministry:{n:'Министерство',d:['obfuscate','presence','protean'],bane:'Отвращение к свету: штраф при ярком свете, больше урона от солнца.',comp:'Искушение: толкает других к пороку.'},
  lasombra:{n:'Ласомбра',d:['dominate','oblivion','potence'],bane:'Искажённое отражение: не отражаются, плохо видны на камерах и для техники.',comp:'Жажда власти: стремится к превосходству.'},
  hecata:{n:'Геката',d:['auspex','fortitude','oblivion'],bane:'Мучительный поцелуй: укус причиняет боль, жертвы сопротивляются.',comp:'Морбидность: тяга к смерти и умершим.'},
  ravnos:{n:'Равнос',d:['animalism','obfuscate','presence'],bane:'Обречённые: днёвка на одном месте подряд — урон огнём.',comp:'Искушение судьбой: ищет риска.'},
  salubri:{n:'Салюбри',d:['auspex','dominate','fortitude'],bane:'Третий глаз и желанная кровь: кровь привлекает вампиров, глаз кровоточит при силах.',comp:'Сострадание: должен помочь страдающему.'},
  tzimisce:{n:'Цимисхи',d:['animalism','dominate','protean'],bane:'Привязанность к земле: днём нужно лежать на своей земле.',comp:'Собственничество: присваивает людей и вещи.'},
  caitiff:{n:'Каитифф',d:[],any:true,bane:'Изгои: социальный штраф среди сородичей; опыт на дисциплины ×6.',comp:'—'},
  thinblood:{n:'Слабая кровь',d:['alchemy'],thin:true,bane:'Нет проклятия клана, но нет и клановых дисциплин; выносят солнце и едят пищу.',comp:'—'},
};
VTM.PREDATORS={
  alleycat:{n:'Уличный кот',spec:[['intimidation','Грабёж'],['brawl','Захваты']],disc:['celerity','potence'],hum:-1,adv:[['Контакты (преступный мир)',3,false]],pool:['str','brawl']},
  bagger:{n:'Мешочник',spec:[['larceny','Взлом замков'],['streetwise','Чёрный рынок']],disc:['bloodsorcery','obfuscate'],adv:[['Железный желудок',3,false],['Враг',2,true]],pool:['int','streetwise'],note:'Вентру не могут выбрать'},
  bloodleech:{n:'Кровавая пиявка',spec:[['brawl','Сородичи'],['stealth','Против сородичей']],disc:['celerity','protean'],hum:-1,bp:1,adv:[['Тёмная тайна: диаблерист / Изгой',2,true],['Исключение добычи: смертные',2,true]],pool:['str','brawl']},
  cleaver:{n:'Мясник',spec:[['persuasion','Газлайтинг'],['subterfuge','Сокрытие']],disc:['dominate','animalism'],adv:[['Тёмная тайна: Мясник',1,true],['Стадо',2,false]],pool:['man','subterfuge']},
  consensualist:{n:'Согласие',spec:[['medicine','Флеботомия'],['persuasion','Жертвы']],disc:['auspex','fortitude'],hum:1,adv:[['Тёмная тайна: нарушитель Маскарада',1,true],['Исключение добычи: без согласия',1,true]],pool:['man','persuasion']},
  farmer:{n:'Фермер',spec:[['animalken','Конкретное животное'],['survival','Охота']],disc:['animalism','protean'],hum:1,adv:[['Веган (питание)',2,true]],pool:['com','animalken']},
  osiris:{n:'Осирис',spec:[['occult','Традиция'],['performance','Сфера развлечений']],disc:['bloodsorcery','presence'],adv:[['Слава/Стадо (распределить 3)',3,false],['Враги/Мифический (распределить 2)',2,true]],pool:['man','subterfuge']},
  sandman:{n:'Песочный человек',spec:[['medicine','Анестезия'],['stealth','Проникновение']],disc:['auspex','obfuscate'],adv:[['Ресурсы',1,false]],pool:['dex','stealth']},
  scenequeen:{n:'Королева тусовки',spec:[['etiquette','Своя тусовка'],['leadership','Своя тусовка'],['streetwise','Своя тусовка']],disc:['dominate','potence'],adv:[['Слава',1,false],['Контакт',1,false],['Нелюбимый / Исключение добычи',1,true]],pool:['man','persuasion']},
  siren:{n:'Сирена',spec:[['persuasion','Соблазнение'],['subterfuge','Соблазнение']],disc:['fortitude','presence'],adv:[['Внешность: красота',2,false],['Враг: отвергнутый любовник',1,true]],pool:['cha','subterfuge']},
};
VTM.GENERATIONS=[[16,'16-е (слабая кровь)',0],[15,'15-е (слабая кровь)',0],[14,'14-е (слабая кровь)',0],[13,'13-е',1],[12,'12-е',1],[11,'11-е',2],[10,'10-е',2],[9,'9-е',3],[8,'8-е',3]];
VTM.AGES={childer:{n:'Птенцы — обращены за последние 15 лет',gen:[13,12],xp:0},neonate:{n:'Неонаты — с 1940 года',gen:[13,12],xp:15},ancilla:{n:'Анциллы — 1780–1940',gen:[11,10],xp:35,adv:2,flaw:2,hum:-1}};
/* Сила крови: [прилив, лечение за Rouse, бонус к дисциплинам, переброс Rouse для сил до уровня, тяжесть проклятия] */
VTM.BP=[[1,1,0,0,0],[2,1,0,1,2],[2,2,1,1,2],[3,2,1,2,3],[3,3,2,2,3],[4,3,2,3,4],[4,4,3,3,4],[5,4,3,4,5],[5,5,4,4,5],[6,5,4,5,6],[6,6,5,5,6]];
VTM.CONVICTIONS_HINT='Например: «Никогда не трогать детей», «Не убивать без необходимости», «Всегда держать слово»';

/* ---------- вычисления по листу ---------- */
VTM.blank=()=>({name:'',concept:'',clan:'',sire:'',predator:'',gen:13,bp:1,age:'neonate',ambition:'',desire:'',chronicle:'',
  attr:{str:1,dex:1,sta:1,cha:1,man:1,com:1,int:1,wit:1,res:1},skills:{},spec:{},disc:{},powers:[],adv:[],conv:[],
  humanity:7,stains:0,hunger:1,health:{s:0,a:0},wp:{s:0,a:0},xp:{total:0,spent:0},notes:'',looks:'',spread:'balanced'});
VTM.val=(c,k)=>{if(!c)return 0;if(k in VTM.ATTR_NAME)return +(c.attr?.[k]||0);if(k in VTM.SKILL_NAME)return +(c.skills?.[k]||0);if(k in VTM.DISC)return +(c.disc?.[k]||0);if(k==='humanity')return +(c.humanity||0);if(k==='bp')return +(c.bp||0);return 0};
VTM.traitName=k=>VTM.ATTR_NAME[k]||VTM.SKILL_NAME[k]||VTM.DISC[k]||({humanity:'Человечность',bp:'Сила крови'})[k]||k;
VTM.healthMax=c=>VTM.val(c,'sta')+3+((c.powers||[]).includes('resilience')?VTM.val(c,'fortitude'):0);
VTM.wpMax=c=>VTM.val(c,'com')+VTM.val(c,'res');
VTM.bpRow=c=>VTM.BP[Math.max(0,Math.min(10,+(c.bp||0)))];
VTM.baneSeverity=c=>VTM.bpRow(c)[4];
/* штрафы ранений: если все клетки здоровья заполнены — минус 2 к физическим пулам; при заполненной Силе воли — минус 2 к социальным и ментальным */
VTM.impair=c=>{const hm=VTM.healthMax(c),h=(c.health?.s||0)+(c.health?.a||0);const wm=VTM.wpMax(c),w=(c.wp?.s||0)+(c.wp?.a||0);return {phys:h>=hm,mind:w>=wm}};
VTM.check=c=>{ // проверка соответствия правилам создания
  const out=[];const a=Object.values(c.attr||{}).map(Number).sort((x,y)=>y-x);
  const okA=JSON.stringify(a)===JSON.stringify(VTM.ATTR_SPREAD);
  out.push([okA,'Атрибуты: один на 4, три на 3, четыре на 2, один на 1',`сейчас: ${a.join(' ')}`]);
  const sp=VTM.SKILL_SPREADS[c.spread]||VTM.SKILL_SPREADS.balanced;const cnt={};Object.values(c.skills||{}).forEach(v=>{if(v>0)cnt[v]=(cnt[v]||0)+1});
  const okS=Object.keys({...sp.d,...cnt}).every(k=>(sp.d[k]||0)===(cnt[k]||0));
  out.push([okS,'Навыки: '+sp.name+' ('+sp.hint+')',Object.keys(cnt).sort((x,y)=>y-x).map(k=>`${cnt[k]}×${k}`).join(', ')||'нет']);
  const clan=VTM.CLANS[c.clan];
  if(!clan)out.push([false,'Выберите клан','']);
  else if(!clan.thin){const ds=Object.entries(c.disc||{}).filter(([,v])=>v>0);const tot=ds.reduce((s,[,v])=>s+ +v,0);const pd=VTM.PREDATORS[c.predator];
    out.push([tot===(pd?4:3)||tot===3,'Дисциплины: 2 точки в одной и 1 в другой клановой, +1 от типа хищника',`всего точек: ${tot}`]);
    const pw=(c.powers||[]).length;out.push([pw===tot,'Силы: по одной на каждую точку дисциплин',`выбрано ${pw} из ${tot}`])}
  out.push([!!c.predator,'Тип хищника выбран',VTM.PREDATORS[c.predator]?.n||'']);
  const adv=(c.adv||[]).filter(x=>!x.flaw&&!x.pred).reduce((s,x)=>s+ +x.dots,0),fl=(c.adv||[]).filter(x=>x.flaw&&!x.pred).reduce((s,x)=>s+ +x.dots,0);
  const ag=VTM.AGES[c.age]||{};out.push([adv===7+(ag.adv||0),`Достоинства: ${7+(ag.adv||0)} точек`,`потрачено ${adv}`]);out.push([fl===2+(ag.flaw||0),`Недостатки: ${2+(ag.flaw||0)} точки (кроме хищника)`,`взято ${fl}`]);
  out.push([(c.conv||[]).length>=1&&(c.conv||[]).length<=3,'Убеждения и опоры: от 1 до 3',`${(c.conv||[]).length}`]);
  return out;
};

/* ---------- движок бросков V5 ---------- */
VTM.d10=()=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%10+1};
VTM.score=(reg,hun,diff)=>{
  const all=[...reg.map(v=>({v,h:0})),...hun.map(v=>({v,h:1}))];
  let succ=all.filter(d=>d.v>=6).length;
  const tens=all.filter(d=>d.v===10),pairs=Math.floor(tens.length/2);
  succ+=pairs*2;
  const hungerTen=hun.includes(10),hungerOne=hun.includes(1);
  const d=diff||0;const win=d?succ>=d:succ>0;
  let res=win?'win':'fail';
  if(win&&pairs>0)res=hungerTen?'messy':'crit';
  if(!win&&hungerOne)res='bestial';
  if(!win&&succ===0&&!hungerOne)res='total';
  return {succ,pairs,res,margin:d?succ-d:null};
};
VTM.roll=({pool,hunger=0,diff=0})=>{
  pool=Math.max(1,pool|0);const h=Math.min(pool,Math.max(0,hunger|0));
  const reg=[],hun=[];for(let i=0;i<pool-h;i++)reg.push(VTM.d10());for(let i=0;i<h;i++)hun.push(VTM.d10());
  return {reg,hun,...VTM.score(reg,hun,diff)};
};
VTM.RES={win:['Успех','#7ad08a'],fail:['Провал','#b9b3a6'],total:['Полный провал','#d07a7a'],crit:['Критический успех','#ffd36a'],messy:['Кровавый крит','#ff4d4d'],bestial:['Звериный провал','#ff4d4d']};
VTM.RES_HINT={messy:'Зверь берёт своё: успех достигнут, но жестоко и безрассудно — возможна Компульсия.',bestial:'Зверь вырывается наружу: провал с последствиями от Голода — Компульсия или безрассудство.',crit:'Блестящий результат.',total:'Ни одного успеха.'};
