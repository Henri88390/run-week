import type { Locale } from "@/features/i18n/locales";

type Messages = {
  heartRate: string; peak: string; average: string; empty: string; rule: string;
  splits: string; split: string; distance: string; pace: string; averageHr: string; maxHr: string;
  splitsEmpty: string; splitsNote: string;
};

export const STREAM_MESSAGES: Record<Locale, Messages> = {
  en: {
    heartRate: "Heart rate", peak: "Highest recorded samples", average: "Highest average",
    empty: "No complete recorded HR data for this duration.",
    rule: "Windows start at recorded samples and may overlap or repeat an activity. Elapsed-time averages include stops; missing HR or gaps over 15 s exclude a window.",
    splits: "Kilometre splits", split: "Split", distance: "Distance", pace: "Elapsed pace",
    averageHr: "Average HR", maxHr: "Max HR", splitsEmpty: "Recorded time and distance are missing or unusable.",
    splitsNote: "Elapsed pace includes stops. HR averages are time-weighted; incomplete HR is unavailable. Max HR uses recorded samples.",
  },
  fr: {
    heartRate: "Fréquence cardiaque", peak: "Mesures enregistrées les plus élevées", average: "Moyenne la plus élevée",
    empty: "Aucune donnée FC complète pour cette durée.",
    rule: "Les fenêtres commencent aux mesures enregistrées et peuvent se chevaucher ou répéter une activité. Les moyennes incluent les arrêts ; une FC manquante ou un intervalle de plus de 15 s exclut la fenêtre.",
    splits: "Passages par kilomètre", split: "Passage", distance: "Distance", pace: "Allure écoulée",
    averageHr: "FC moyenne", maxHr: "FC max", splitsEmpty: "Temps et distance enregistrés manquants ou inutilisables.",
    splitsNote: "L’allure inclut les arrêts. La FC moyenne est pondérée par le temps ; elle est indisponible si incomplète. Le maximum utilise les mesures enregistrées.",
  },
  de: {
    heartRate: "Herzfrequenz", peak: "Höchste aufgezeichnete Messwerte", average: "Höchster Durchschnitt",
    empty: "Keine vollständigen HF-Daten für diese Dauer.",
    rule: "Fenster beginnen an aufgezeichneten Messpunkten und dürfen sich überlappen oder eine Aktivität wiederholen. Pausen zählen mit; fehlende HF oder Lücken über 15 s schließen ein Fenster aus.",
    splits: "Kilometerabschnitte", split: "Abschnitt", distance: "Distanz", pace: "Tempo inkl. Pausen",
    averageHr: "Ø HF", maxHr: "Max. HF", splitsEmpty: "Aufgezeichnete Zeit und Distanz fehlen oder sind unbrauchbar.",
    splitsNote: "Das Tempo enthält Pausen. HF-Mittelwerte sind zeitgewichtet; unvollständige HF ist nicht verfügbar. Maxima sind aufgezeichnete Messwerte.",
  },
  es: {
    heartRate: "Frecuencia cardíaca", peak: "Muestras registradas más altas", average: "Media más alta",
    empty: "No hay datos de FC completos para esta duración.",
    rule: "Las ventanas empiezan en muestras registradas y pueden solaparse o repetir una actividad. Las medias incluyen paradas; la FC ausente o los huecos de más de 15 s excluyen la ventana.",
    splits: "Parciales por kilómetro", split: "Parcial", distance: "Distancia", pace: "Ritmo transcurrido",
    averageHr: "FC media", maxHr: "FC máx.", splitsEmpty: "Faltan tiempo y distancia registrados válidos.",
    splitsNote: "El ritmo incluye paradas. La FC media se pondera por tiempo; no se muestra si está incompleta. La máxima usa muestras registradas.",
  },
  pt: {
    heartRate: "Frequência cardíaca", peak: "Amostras registadas mais altas", average: "Média mais alta",
    empty: "Sem dados de FC completos para esta duração.",
    rule: "As janelas começam em amostras registadas e podem sobrepor-se ou repetir uma atividade. As médias incluem paragens; FC em falta ou intervalos superiores a 15 s excluem a janela.",
    splits: "Parciais por quilómetro", split: "Parcial", distance: "Distância", pace: "Ritmo decorrido",
    averageHr: "FC média", maxHr: "FC máx.", splitsEmpty: "Tempo e distância registados em falta ou inutilizáveis.",
    splitsNote: "O ritmo inclui paragens. A FC média é ponderada pelo tempo; dados incompletos não são apresentados. A máxima usa amostras registadas.",
  },
  pl: {
    heartRate: "Tętno", peak: "Najwyższe zapisane próbki", average: "Najwyższa średnia",
    empty: "Brak pełnych danych tętna dla tego czasu.",
    rule: "Okna zaczynają się w zapisanych próbkach i mogą się nakładać lub powtarzać aktywność. Średnie uwzględniają postoje; brak tętna lub przerwy ponad 15 s wykluczają okno.",
    splits: "Odcinki kilometrowe", split: "Odcinek", distance: "Dystans", pace: "Tempo z postojami",
    averageHr: "Średnie tętno", maxHr: "Maks. tętno", splitsEmpty: "Brak użytecznego zapisu czasu i dystansu.",
    splitsNote: "Tempo uwzględnia postoje. Średnie tętno jest ważone czasem; niepełne dane są niedostępne. Maksimum pochodzi z zapisanych próbek.",
  },
  ru: {
    heartRate: "Пульс", peak: "Самые высокие записанные значения", average: "Самое высокое среднее",
    empty: "Нет полных данных пульса для этой длительности.",
    rule: "Окна начинаются в записанных точках, могут пересекаться и повторять тренировку. Средние включают остановки; пропуски пульса или интервалы свыше 15 с исключают окно.",
    splits: "Отрезки по километрам", split: "Отрезок", distance: "Расстояние", pace: "Темп с остановками",
    averageHr: "Средний пульс", maxHr: "Макс. пульс", splitsEmpty: "Нет пригодных записей времени и расстояния.",
    splitsNote: "Темп включает остановки. Средний пульс взвешен по времени; неполные данные недоступны. Максимум — из записанных значений.",
  },
  uk: {
    heartRate: "Пульс", peak: "Найвищі записані значення", average: "Найвище середнє",
    empty: "Немає повних даних пульсу для цієї тривалості.",
    rule: "Вікна починаються в записаних точках, можуть перекриватися й повторювати тренування. Середні включають зупинки; пропуски пульсу або інтервали понад 15 с виключають вікно.",
    splits: "Відрізки за кілометрами", split: "Відрізок", distance: "Відстань", pace: "Темп із зупинками",
    averageHr: "Середній пульс", maxHr: "Макс. пульс", splitsEmpty: "Немає придатних записів часу та відстані.",
    splitsNote: "Темп включає зупинки. Середній пульс зважений за часом; неповні дані недоступні. Максимум — із записаних значень.",
  },
  be: {
    heartRate: "Пульс", peak: "Найвышэйшыя запісаныя значэнні", average: "Найвышэйшае сярэдняе",
    empty: "Няма поўных даных пульсу для гэтай працягласці.",
    rule: "Вокны пачынаюцца ў запісаных кропках, могуць перакрывацца і паўтараць трэніроўку. Сярэднія ўключаюць спыненні; пропускі пульсу або інтэрвалы звыш 15 с выключаюць акно.",
    splits: "Адрэзкі па кіламетрах", split: "Адрэзак", distance: "Адлегласць", pace: "Тэмп са спыненнямі",
    averageHr: "Сярэдні пульс", maxHr: "Макс. пульс", splitsEmpty: "Няма прыдатных запісаў часу і адлегласці.",
    splitsNote: "Тэмп уключае спыненні. Сярэдні пульс узважаны па часе; няпоўныя даныя недаступныя. Максімум — з запісаных значэнняў.",
  },
  it: {
    heartRate: "Frequenza cardiaca", peak: "Campioni registrati più alti", average: "Media più alta",
    empty: "Nessun dato FC completo per questa durata.",
    rule: "Le finestre iniziano ai campioni registrati e possono sovrapporsi o ripetere un’attività. Le medie includono le soste; FC mancante o intervalli oltre 15 s escludono la finestra.",
    splits: "Intertempi chilometrici", split: "Intertempo", distance: "Distanza", pace: "Passo trascorso",
    averageHr: "FC media", maxHr: "FC max", splitsEmpty: "Tempo e distanza registrati mancanti o inutilizzabili.",
    splitsNote: "Il passo include le soste. La FC media è ponderata nel tempo; dati incompleti non sono disponibili. Il massimo usa campioni registrati.",
  },
};
