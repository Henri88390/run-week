import type { Locale } from "@/features/i18n/locales";

export type AboutFeatureKey = "planner" | "garmin" | "activities" | "metrics";

export type AboutText = {
  nav: string;
  title: string;
  intro: string;
  featuresTitle: string;
  features: Record<AboutFeatureKey, { title: string; body: string; link: string }>;
  accountTitle: string;
  account: string;
  limits: string;
};

export const ABOUT_MESSAGES: Record<Locale, AboutText> = {
  en: {
    nav: "About",
    title: "About Run Week",
    intro: "Run Week helps runners plan a training week and review the runs they have done. It works in ten languages, in light or dark mode, on desktop and mobile.",
    featuresTitle: "What it does",
    features: {
      planner: {
        title: "Training week simulator",
        body: "Enter a recent race result, a weekly distance or time target, and either the days you run or the number of runs per week. Run Week estimates your VDOT with Jack Daniels’ formulas and builds a week of easy runs, a long run and optional interval or threshold workouts, with target paces and workout details.",
        link: "Open the planner",
      },
      garmin: {
        title: "Garmin Connect",
        body: "With an account, send the whole week or a single run to your Garmin Connect calendar as structured workouts for your watch.",
        link: "Send a week from the planner",
      },
      activities: {
        title: "Activity overview",
        body: "Connect Strava to see your runs in a week, month or year calendar, with training volume, heart-rate zones, pace distribution and time above threshold. Each activity has heart-rate and pace graphs.",
        link: "View your activities",
      },
      metrics: {
        title: "Running metrics",
        body: "Estimates of critical speed, VMA and threshold pace from race or test efforts you mark, along with endurance indicators based on your training history.",
        link: "View your running metrics",
      },
    },
    accountTitle: "Accounts and limits",
    account: "An account is optional: the planner works signed out and is saved in the browser. Signing in, by email code or Google, saves the planner to your account and enables Garmin and Strava.",
    limits: "Plans and metrics come from published formulas and simple rules. They are descriptive, not personalized coaching or medical advice.",
  },
  fr: {
    nav: "À propos",
    title: "À propos de Run Week",
    intro: "Run Week aide les coureurs à planifier une semaine d’entraînement et à analyser les sorties effectuées. L’application est disponible en dix langues, en mode clair ou sombre, sur ordinateur et sur mobile.",
    featuresTitle: "Fonctionnalités",
    features: {
      planner: {
        title: "Simulateur de semaine d’entraînement",
        body: "Indiquez un résultat de course récent, un objectif hebdomadaire en distance ou en temps, et vos jours de course ou le nombre de sorties par semaine. Run Week estime votre VDOT avec les formules de Jack Daniels et construit une semaine de footings, une sortie longue et des séances de fractionné ou de seuil facultatives, avec allures cibles et détail des séances.",
        link: "Ouvrir le simulateur",
      },
      garmin: {
        title: "Garmin Connect",
        body: "Avec un compte, envoyez toute la semaine ou une seule sortie vers votre calendrier Garmin Connect, sous forme d’entraînements structurés pour votre montre.",
        link: "Envoyer une semaine depuis le simulateur",
      },
      activities: {
        title: "Activités",
        body: "Connectez Strava pour voir vos sorties dans un calendrier hebdomadaire, mensuel ou annuel, avec volume d’entraînement, zones de fréquence cardiaque, répartition des allures et temps au-dessus du seuil. Chaque activité dispose de graphiques de fréquence cardiaque et d’allure.",
        link: "Voir vos activités",
      },
      metrics: {
        title: "Indicateurs de performance",
        body: "Estimations de la vitesse critique, de la VMA et de l’allure seuil à partir des courses ou tests que vous marquez, ainsi que des indicateurs d’endurance basés sur votre historique d’entraînement.",
        link: "Voir vos indicateurs",
      },
    },
    accountTitle: "Compte et limites",
    account: "Le compte est facultatif : le simulateur fonctionne sans connexion et est enregistré dans le navigateur. La connexion, par code e-mail ou Google, enregistre le simulateur dans votre compte et active Garmin et Strava.",
    limits: "Les plans et indicateurs reposent sur des formules publiées et des règles simples. Ils sont descriptifs et ne constituent pas un coaching personnalisé ni un avis médical.",
  },
  de: {
    nav: "Über",
    title: "Über Run Week",
    intro: "Run Week hilft Läuferinnen und Läufern, eine Trainingswoche zu planen und ihre Läufe auszuwerten. Die App ist in zehn Sprachen, im hellen oder dunklen Modus, auf Desktop und Mobilgeräten nutzbar.",
    featuresTitle: "Funktionen",
    features: {
      planner: {
        title: "Trainingswochen-Simulator",
        body: "Gib ein aktuelles Wettkampfergebnis, ein wöchentliches Distanz- oder Zeitziel und deine Lauftage oder die Anzahl der Läufe pro Woche ein. Run Week schätzt deinen VDOT mit den Formeln von Jack Daniels und erstellt eine Woche mit lockeren Läufen, einem langen Lauf und optionalen Intervall- oder Schwelleneinheiten, mit Zielpaces und Einheitendetails.",
        link: "Planer öffnen",
      },
      garmin: {
        title: "Garmin Connect",
        body: "Mit einem Konto sendest du die ganze Woche oder einen einzelnen Lauf als strukturierte Trainings für deine Uhr in deinen Garmin-Connect-Kalender.",
        link: "Woche aus dem Planer senden",
      },
      activities: {
        title: "Aktivitätsübersicht",
        body: "Verbinde Strava, um deine Läufe in einem Wochen-, Monats- oder Jahreskalender zu sehen, mit Trainingsumfang, Herzfrequenzzonen, Paceverteilung und Zeit über der Schwelle. Jede Aktivität hat Herzfrequenz- und Pace-Diagramme.",
        link: "Aktivitäten ansehen",
      },
      metrics: {
        title: "Laufkennzahlen",
        body: "Schätzungen von kritischer Geschwindigkeit, VMA und Schwellenpace aus von dir markierten Wettkämpfen oder Tests sowie Ausdauerindikatoren aus deinem Trainingsverlauf.",
        link: "Laufkennzahlen ansehen",
      },
    },
    accountTitle: "Konto und Grenzen",
    account: "Ein Konto ist optional: Der Planer funktioniert ohne Anmeldung und wird im Browser gespeichert. Die Anmeldung per E-Mail-Code oder Google speichert den Planer im Konto und aktiviert Garmin und Strava.",
    limits: "Pläne und Kennzahlen beruhen auf veröffentlichten Formeln und einfachen Regeln. Sie sind beschreibend und keine persönliche Trainings- oder medizinische Beratung.",
  },
  es: {
    nav: "Acerca de",
    title: "Acerca de Run Week",
    intro: "Run Week ayuda a los corredores a planificar una semana de entrenamiento y a revisar las carreras realizadas. Funciona en diez idiomas, en modo claro u oscuro, en ordenador y móvil.",
    featuresTitle: "Qué hace",
    features: {
      planner: {
        title: "Simulador de semana de entrenamiento",
        body: "Introduce un resultado de carrera reciente, un objetivo semanal de distancia o tiempo, y tus días de carrera o el número de salidas por semana. Run Week estima tu VDOT con las fórmulas de Jack Daniels y crea una semana de rodajes suaves, una tirada larga y sesiones opcionales de series o umbral, con ritmos objetivo y detalles de cada sesión.",
        link: "Abrir el planificador",
      },
      garmin: {
        title: "Garmin Connect",
        body: "Con una cuenta, envía toda la semana o una sola carrera a tu calendario de Garmin Connect como entrenamientos estructurados para tu reloj.",
        link: "Enviar una semana desde el planificador",
      },
      activities: {
        title: "Resumen de actividades",
        body: "Conecta Strava para ver tus carreras en un calendario semanal, mensual o anual, con volumen de entrenamiento, zonas de frecuencia cardíaca, distribución de ritmos y tiempo por encima del umbral. Cada actividad tiene gráficos de frecuencia cardíaca y ritmo.",
        link: "Ver tus actividades",
      },
      metrics: {
        title: "Métricas de carrera",
        body: "Estimaciones de velocidad crítica, VAM y ritmo umbral a partir de las carreras o pruebas que marques, junto con indicadores de resistencia basados en tu historial de entrenamiento.",
        link: "Ver tus métricas",
      },
    },
    accountTitle: "Cuenta y límites",
    account: "La cuenta es opcional: el planificador funciona sin iniciar sesión y se guarda en el navegador. Al iniciar sesión, con código por correo o Google, el planificador se guarda en tu cuenta y se activan Garmin y Strava.",
    limits: "Los planes y métricas se basan en fórmulas publicadas y reglas simples. Son descriptivos, no entrenamiento personalizado ni consejo médico.",
  },
  pt: {
    nav: "Sobre",
    title: "Sobre o Run Week",
    intro: "O Run Week ajuda corredores a planear uma semana de treino e a rever as corridas feitas. Funciona em dez idiomas, em modo claro ou escuro, no computador e no telemóvel.",
    featuresTitle: "O que faz",
    features: {
      planner: {
        title: "Simulador de semana de treino",
        body: "Indique um resultado de prova recente, um objetivo semanal de distância ou tempo, e os seus dias de corrida ou o número de corridas por semana. O Run Week estima o seu VDOT com as fórmulas de Jack Daniels e cria uma semana de corridas leves, uma corrida longa e treinos opcionais de intervalos ou limiar, com ritmos-alvo e detalhes dos treinos.",
        link: "Abrir o planeador",
      },
      garmin: {
        title: "Garmin Connect",
        body: "Com uma conta, envie a semana inteira ou uma única corrida para o calendário do Garmin Connect como treinos estruturados para o seu relógio.",
        link: "Enviar uma semana a partir do planeador",
      },
      activities: {
        title: "Resumo de atividades",
        body: "Ligue o Strava para ver as suas corridas num calendário semanal, mensal ou anual, com volume de treino, zonas de frequência cardíaca, distribuição de ritmos e tempo acima do limiar. Cada atividade tem gráficos de frequência cardíaca e ritmo.",
        link: "Ver as suas atividades",
      },
      metrics: {
        title: "Métricas de corrida",
        body: "Estimativas de velocidade crítica, VAM e ritmo de limiar a partir das provas ou testes que marcar, com indicadores de resistência baseados no seu histórico de treino.",
        link: "Ver as suas métricas",
      },
    },
    accountTitle: "Conta e limites",
    account: "A conta é opcional: o planeador funciona sem sessão iniciada e é guardado no navegador. Iniciar sessão, por código de e-mail ou Google, guarda o planeador na conta e ativa o Garmin e o Strava.",
    limits: "Os planos e métricas baseiam-se em fórmulas publicadas e regras simples. São descritivos, não treino personalizado nem aconselhamento médico.",
  },
  it: {
    nav: "Informazioni",
    title: "Informazioni su Run Week",
    intro: "Run Week aiuta i runner a pianificare una settimana di allenamento e a rivedere le corse svolte. Funziona in dieci lingue, in modalità chiara o scura, su computer e smartphone.",
    featuresTitle: "Cosa fa",
    features: {
      planner: {
        title: "Simulatore della settimana di allenamento",
        body: "Inserisci un risultato di gara recente, un obiettivo settimanale di distanza o tempo e i tuoi giorni di corsa o il numero di uscite a settimana. Run Week stima il tuo VDOT con le formule di Jack Daniels e crea una settimana di corse facili, un lungo e allenamenti facoltativi di ripetute o soglia, con ritmi obiettivo e dettagli degli allenamenti.",
        link: "Apri il pianificatore",
      },
      garmin: {
        title: "Garmin Connect",
        body: "Con un account, invia l’intera settimana o una singola corsa al calendario di Garmin Connect come allenamenti strutturati per il tuo orologio.",
        link: "Invia una settimana dal pianificatore",
      },
      activities: {
        title: "Panoramica attività",
        body: "Collega Strava per vedere le tue corse in un calendario settimanale, mensile o annuale, con volume di allenamento, zone di frequenza cardiaca, distribuzione dei ritmi e tempo sopra soglia. Ogni attività ha grafici di frequenza cardiaca e ritmo.",
        link: "Vedi le tue attività",
      },
      metrics: {
        title: "Metriche di corsa",
        body: "Stime di velocità critica, VAM e ritmo soglia dalle gare o dai test che segni, insieme a indicatori di resistenza basati sul tuo storico di allenamento.",
        link: "Vedi le tue metriche",
      },
    },
    accountTitle: "Account e limiti",
    account: "L’account è facoltativo: il pianificatore funziona senza accesso ed è salvato nel browser. Accedendo, con codice e-mail o Google, il pianificatore viene salvato nell’account e si attivano Garmin e Strava.",
    limits: "Piani e metriche derivano da formule pubblicate e regole semplici. Sono descrittivi, non coaching personalizzato né consigli medici.",
  },
  pl: {
    nav: "O aplikacji",
    title: "O Run Week",
    intro: "Run Week pomaga biegaczom zaplanować tydzień treningowy i przejrzeć wykonane biegi. Działa w dziesięciu językach, w trybie jasnym lub ciemnym, na komputerze i telefonie.",
    featuresTitle: "Co robi",
    features: {
      planner: {
        title: "Symulator tygodnia treningowego",
        body: "Podaj niedawny wynik z zawodów, tygodniowy cel dystansu lub czasu oraz dni biegania albo liczbę biegów w tygodniu. Run Week szacuje Twój VDOT według wzorów Jacka Danielsa i tworzy tydzień spokojnych biegów, długie wybieganie oraz opcjonalne interwały lub trening progowy, z docelowymi tempami i szczegółami treningów.",
        link: "Otwórz planer",
      },
      garmin: {
        title: "Garmin Connect",
        body: "Z kontem wyślesz cały tydzień lub pojedynczy bieg do kalendarza Garmin Connect jako treningi strukturalne na zegarek.",
        link: "Wyślij tydzień z planera",
      },
      activities: {
        title: "Przegląd aktywności",
        body: "Połącz Strava, aby zobaczyć biegi w kalendarzu tygodniowym, miesięcznym lub rocznym, z objętością treningu, strefami tętna, rozkładem temp i czasem powyżej progu. Każda aktywność ma wykresy tętna i tempa.",
        link: "Zobacz swoje aktywności",
      },
      metrics: {
        title: "Wskaźniki biegowe",
        body: "Szacunki prędkości krytycznej, VMA i tempa progowego na podstawie oznaczonych zawodów lub testów oraz wskaźniki wytrzymałości oparte na historii treningów.",
        link: "Zobacz swoje wskaźniki",
      },
    },
    accountTitle: "Konto i ograniczenia",
    account: "Konto jest opcjonalne: planer działa bez logowania i jest zapisywany w przeglądarce. Logowanie kodem e-mail lub przez Google zapisuje planer na koncie i włącza Garmin oraz Strava.",
    limits: "Plany i wskaźniki opierają się na opublikowanych wzorach i prostych regułach. Mają charakter opisowy i nie są spersonalizowanym treningiem ani poradą medyczną.",
  },
  ru: {
    nav: "О приложении",
    title: "О Run Week",
    intro: "Run Week помогает бегунам планировать тренировочную неделю и анализировать выполненные пробежки. Приложение работает на десяти языках, в светлой или тёмной теме, на компьютере и телефоне.",
    featuresTitle: "Возможности",
    features: {
      planner: {
        title: "Симулятор тренировочной недели",
        body: "Укажите недавний результат забега, недельную цель по дистанции или времени, а также дни пробежек или их количество в неделю. Run Week оценивает ваш VDOT по формулам Джека Дэниелса и составляет неделю из лёгких пробежек, длительной и необязательных интервальных или пороговых тренировок с целевым темпом и описанием.",
        link: "Открыть планировщик",
      },
      garmin: {
        title: "Garmin Connect",
        body: "С аккаунтом можно отправить всю неделю или одну пробежку в календарь Garmin Connect как структурированные тренировки для часов.",
        link: "Отправить неделю из планировщика",
      },
      activities: {
        title: "Обзор активностей",
        body: "Подключите Strava, чтобы видеть пробежки в календаре за неделю, месяц или год, с объёмом тренировок, пульсовыми зонами, распределением темпа и временем выше порога. Для каждой активности есть графики пульса и темпа.",
        link: "Посмотреть активности",
      },
      metrics: {
        title: "Беговые показатели",
        body: "Оценки критической скорости, МАС и порогового темпа по отмеченным вами забегам или тестам, а также показатели выносливости на основе истории тренировок.",
        link: "Посмотреть показатели",
      },
    },
    accountTitle: "Аккаунт и ограничения",
    account: "Аккаунт необязателен: планировщик работает без входа и сохраняется в браузере. Вход по коду из письма или через Google сохраняет планировщик в аккаунте и включает Garmin и Strava.",
    limits: "Планы и показатели основаны на опубликованных формулах и простых правилах. Они описательные и не являются персональными тренировочными или медицинскими рекомендациями.",
  },
  uk: {
    nav: "Про застосунок",
    title: "Про Run Week",
    intro: "Run Week допомагає бігунам планувати тренувальний тиждень і переглядати виконані пробіжки. Застосунок працює десятьма мовами, у світлій або темній темі, на комп’ютері й телефоні.",
    featuresTitle: "Можливості",
    features: {
      planner: {
        title: "Симулятор тренувального тижня",
        body: "Вкажіть нещодавній результат забігу, тижневу ціль за дистанцією або часом, а також дні пробіжок або їх кількість на тиждень. Run Week оцінює ваш VDOT за формулами Джека Деніелса і складає тиждень із легких пробіжок, тривалої та необов’язкових інтервальних або порогових тренувань із цільовим темпом і описом.",
        link: "Відкрити планувальник",
      },
      garmin: {
        title: "Garmin Connect",
        body: "З обліковим записом можна надіслати весь тиждень або одну пробіжку в календар Garmin Connect як структуровані тренування для годинника.",
        link: "Надіслати тиждень із планувальника",
      },
      activities: {
        title: "Огляд активностей",
        body: "Підключіть Strava, щоб бачити пробіжки в календарі за тиждень, місяць або рік, з обсягом тренувань, пульсовими зонами, розподілом темпу та часом вище порогу. Для кожної активності є графіки пульсу й темпу.",
        link: "Переглянути активності",
      },
      metrics: {
        title: "Бігові показники",
        body: "Оцінки критичної швидкості, МАШ і порогового темпу за позначеними вами забігами або тестами, а також показники витривалості на основі історії тренувань.",
        link: "Переглянути показники",
      },
    },
    accountTitle: "Обліковий запис і обмеження",
    account: "Обліковий запис необов’язковий: планувальник працює без входу й зберігається в браузері. Вхід за кодом з листа або через Google зберігає планувальник в обліковому записі та вмикає Garmin і Strava.",
    limits: "Плани й показники ґрунтуються на опублікованих формулах і простих правилах. Вони описові й не є персональними тренувальними чи медичними рекомендаціями.",
  },
  be: {
    nav: "Пра праграму",
    title: "Пра Run Week",
    intro: "Run Week дапамагае бегунам планаваць трэніровачны тыдзень і праглядаць выкананыя прабежкі. Праграма працуе на дзесяці мовах, у светлай або цёмнай тэме, на камп’ютары і тэлефоне.",
    featuresTitle: "Магчымасці",
    features: {
      planner: {
        title: "Сімулятар трэніровачнага тыдня",
        body: "Укажыце нядаўні вынік забегу, тыднёвую мэту па дыстанцыі або часе, а таксама дні прабежак або іх колькасць на тыдзень. Run Week ацэньвае ваш VDOT па формулах Джэка Дэніэлса і складае тыдзень з лёгкіх прабежак, працяглай і неабавязковых інтэрвальных або парогавых трэніровак з мэтавым тэмпам і апісаннем.",
        link: "Адкрыць планавальнік",
      },
      garmin: {
        title: "Garmin Connect",
        body: "З акаўнтам можна адправіць увесь тыдзень або адну прабежку ў каляндар Garmin Connect як структураваныя трэніроўкі для гадзінніка.",
        link: "Адправіць тыдзень з планавальніка",
      },
      activities: {
        title: "Агляд актыўнасцей",
        body: "Падключыце Strava, каб бачыць прабежкі ў календары за тыдзень, месяц або год, з аб’ёмам трэніровак, пульсавымі зонамі, размеркаваннем тэмпу і часам вышэй за парог. Для кожнай актыўнасці ёсць графікі пульсу і тэмпу.",
        link: "Паглядзець актыўнасці",
      },
      metrics: {
        title: "Бегавыя паказчыкі",
        body: "Ацэнкі крытычнай хуткасці, МАХ і парогавага тэмпу па адзначаных вамі забегах або тэстах, а таксама паказчыкі вынослівасці на аснове гісторыі трэніровак.",
        link: "Паглядзець паказчыкі",
      },
    },
    accountTitle: "Акаўнт і абмежаванні",
    account: "Акаўнт неабавязковы: планавальнік працуе без уваходу і захоўваецца ў браўзеры. Уваход па кодзе з ліста або праз Google захоўвае планавальнік у акаўнце і ўключае Garmin і Strava.",
    limits: "Планы і паказчыкі грунтуюцца на апублікаваных формулах і простых правілах. Яны апісальныя і не з’яўляюцца персанальнымі трэніровачнымі ці медыцынскімі рэкамендацыямі.",
  },
};
