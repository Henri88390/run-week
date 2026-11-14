import type { Locale } from "@/features/i18n/locales";

type Messages = {
  heartRate: string; peak: string; average: string; empty: string; rule: string;
  splits: string; split: string; distance: string; pace: string; averageHr: string; maxHr: string;
  splitsEmpty: string; splitsNote: string; selectionHelp: string;
};

export const STREAM_MESSAGES: Record<Locale, Messages> = {
  en: {
    heartRate: "Heart rate", peak: "Highest recorded samples", average: "Highest average",
    empty: "No complete recorded HR data for this duration.",
    rule: "Windows start at recorded samples and may overlap or repeat an activity. Elapsed-time averages include stops; missing HR or gaps over 15 s exclude a window.",
    splits: "Kilometre splits", split: "Split", distance: "Distance", pace: "Elapsed pace",
    averageHr: "Average HR", maxHr: "Max HR", splitsEmpty: "Recorded time and distance are missing or unusable.",
    splitsNote: "Elapsed pace includes stops. Missing raw time/distance coverage makes a split unavailable, even when smoothed charts show measurements. HR averages are time-weighted; incomplete HR is unavailable. Max HR uses recorded samples.",
    selectionHelp: "Select any splits to highlight them on all charts; select again to remove. Unknown elapsed boundaries cannot be highlighted on the time axis. Selection is temporary.",
  },
  fr: {
    heartRate: "Fréquence cardiaque", peak: "Mesures enregistrées les plus élevées", average: "Moyenne la plus élevée",
    empty: "Aucune donnée FC complète pour cette durée.",
    rule: "Les fenêtres commencent aux mesures enregistrées et peuvent se chevaucher ou répéter une activité. Les moyennes incluent les arrêts ; une FC manquante ou un intervalle de plus de 15 s exclut la fenêtre.",
    splits: "Passages par kilomètre", split: "Passage", distance: "Distance", pace: "Allure écoulée",
    averageHr: "FC moyenne", maxHr: "FC max", splitsEmpty: "Temps et distance enregistrés manquants ou inutilisables.",
    splitsNote: "L’allure inclut les arrêts. Un temps ou une distance brute incomplets rendent le passage indisponible, même si les graphiques lissés affichent des mesures. La FC moyenne est pondérée par le temps ; elle est indisponible si incomplète. Le maximum utilise les mesures enregistrées.",
    selectionHelp: "Sélectionnez des passages pour les surligner sur tous les graphiques ; sélectionnez à nouveau pour les retirer. Les limites temporelles inconnues ne peuvent pas être surlignées sur l’axe du temps. La sélection est temporaire.",
  },
  de: {
    heartRate: "Herzfrequenz", peak: "Höchste aufgezeichnete Messwerte", average: "Höchster Durchschnitt",
    empty: "Keine vollständigen HF-Daten für diese Dauer.",
    rule: "Fenster beginnen an aufgezeichneten Messpunkten und dürfen sich überlappen oder eine Aktivität wiederholen. Pausen zählen mit; fehlende HF oder Lücken über 15 s schließen ein Fenster aus.",
    splits: "Kilometerabschnitte", split: "Abschnitt", distance: "Distanz", pace: "Tempo inkl. Pausen",
    averageHr: "Ø HF", maxHr: "Max. HF", splitsEmpty: "Aufgezeichnete Zeit und Distanz fehlen oder sind unbrauchbar.",
    splitsNote: "Das Tempo enthält Pausen. Fehlende Rohdaten zu Zeit oder Distanz machen einen Abschnitt unverfügbar, auch wenn geglättete Diagramme Messwerte zeigen. HF-Mittelwerte sind zeitgewichtet; unvollständige HF ist nicht verfügbar. Maxima sind aufgezeichnete Messwerte.",
    selectionHelp: "Beliebige Abschnitte auswählen, um sie in allen Diagrammen hervorzuheben; erneut auswählen zum Entfernen. Unbekannte Zeitgrenzen können auf der Zeitachse nicht hervorgehoben werden. Die Auswahl ist vorübergehend.",
  },
  es: {
    heartRate: "Frecuencia cardíaca", peak: "Muestras registradas más altas", average: "Media más alta",
    empty: "No hay datos de FC completos para esta duración.",
    rule: "Las ventanas empiezan en muestras registradas y pueden solaparse o repetir una actividad. Las medias incluyen paradas; la FC ausente o los huecos de más de 15 s excluyen la ventana.",
    splits: "Parciales por kilómetro", split: "Parcial", distance: "Distancia", pace: "Ritmo transcurrido",
    averageHr: "FC media", maxHr: "FC máx.", splitsEmpty: "Faltan tiempo y distancia registrados válidos.",
    splitsNote: "El ritmo incluye paradas. Si faltan datos originales de tiempo o distancia, el parcial no está disponible, aunque los gráficos suavizados muestren medidas. La FC media se pondera por tiempo; no se muestra si está incompleta. La máxima usa muestras registradas.",
    selectionHelp: "Selecciona parciales para resaltarlos en todos los gráficos; vuelve a seleccionarlos para quitarlos. Los límites temporales desconocidos no pueden resaltarse en el eje de tiempo. La selección es temporal.",
  },
  pt: {
    heartRate: "Frequência cardíaca", peak: "Amostras registadas mais altas", average: "Média mais alta",
    empty: "Sem dados de FC completos para esta duração.",
    rule: "As janelas começam em amostras registadas e podem sobrepor-se ou repetir uma atividade. As médias incluem paragens; FC em falta ou intervalos superiores a 15 s excluem a janela.",
    splits: "Parciais por quilómetro", split: "Parcial", distance: "Distância", pace: "Ritmo decorrido",
    averageHr: "FC média", maxHr: "FC máx.", splitsEmpty: "Tempo e distância registados em falta ou inutilizáveis.",
    splitsNote: "O ritmo inclui paragens. Dados originais de tempo ou distância em falta tornam o parcial indisponível, mesmo que os gráficos suavizados mostrem medições. A FC média é ponderada pelo tempo; dados incompletos não são apresentados. A máxima usa amostras registadas.",
    selectionHelp: "Selecione parciais para os destacar em todos os gráficos; selecione novamente para os remover. Limites temporais desconhecidos não podem ser destacados no eixo do tempo. A seleção é temporária.",
  },
  pl: {
    heartRate: "Tętno", peak: "Najwyższe zapisane próbki", average: "Najwyższa średnia",
    empty: "Brak pełnych danych tętna dla tego czasu.",
    rule: "Okna zaczynają się w zapisanych próbkach i mogą się nakładać lub powtarzać aktywność. Średnie uwzględniają postoje; brak tętna lub przerwy ponad 15 s wykluczają okno.",
    splits: "Odcinki kilometrowe", split: "Odcinek", distance: "Dystans", pace: "Tempo z postojami",
    averageHr: "Średnie tętno", maxHr: "Maks. tętno", splitsEmpty: "Brak użytecznego zapisu czasu i dystansu.",
    splitsNote: "Tempo uwzględnia postoje. Brak surowych danych czasu lub dystansu oznacza niedostępny odcinek, nawet gdy wygładzone wykresy pokazują pomiary. Średnie tętno jest ważone czasem; niepełne dane są niedostępne. Maksimum pochodzi z zapisanych próbek.",
    selectionHelp: "Wybierz odcinki, aby wyróżnić je na wszystkich wykresach; wybierz ponownie, aby je usunąć. Nieznanych granic czasowych nie można wyróżnić na osi czasu. Wybór jest tymczasowy.",
  },
  ru: {
    heartRate: "Пульс", peak: "Самые высокие записанные значения", average: "Самое высокое среднее",
    empty: "Нет полных данных пульса для этой длительности.",
    rule: "Окна начинаются в записанных точках, могут пересекаться и повторять тренировку. Средние включают остановки; пропуски пульса или интервалы свыше 15 с исключают окно.",
    splits: "Отрезки по километрам", split: "Отрезок", distance: "Расстояние", pace: "Темп с остановками",
    averageHr: "Средний пульс", maxHr: "Макс. пульс", splitsEmpty: "Нет пригодных записей времени и расстояния.",
    splitsNote: "Темп включает остановки. При нехватке исходных данных времени или расстояния отрезок недоступен, даже если сглаженные графики показывают измерения. Средний пульс взвешен по времени; неполные данные недоступны. Максимум — из записанных значений.",
    selectionHelp: "Выберите отрезки, чтобы выделить их на всех графиках; выберите повторно, чтобы убрать. Неизвестные временные границы нельзя выделить на оси времени. Выбор временный.",
  },
  uk: {
    heartRate: "Пульс", peak: "Найвищі записані значення", average: "Найвище середнє",
    empty: "Немає повних даних пульсу для цієї тривалості.",
    rule: "Вікна починаються в записаних точках, можуть перекриватися й повторювати тренування. Середні включають зупинки; пропуски пульсу або інтервали понад 15 с виключають вікно.",
    splits: "Відрізки за кілометрами", split: "Відрізок", distance: "Відстань", pace: "Темп із зупинками",
    averageHr: "Середній пульс", maxHr: "Макс. пульс", splitsEmpty: "Немає придатних записів часу та відстані.",
    splitsNote: "Темп включає зупинки. За відсутності початкових даних часу чи відстані відрізок недоступний, навіть якщо згладжені графіки показують вимірювання. Середній пульс зважений за часом; неповні дані недоступні. Максимум — із записаних значень.",
    selectionHelp: "Виберіть відрізки, щоб виділити їх на всіх графіках; виберіть повторно, щоб прибрати. Невідомі часові межі не можна виділити на осі часу. Вибір тимчасовий.",
  },
  be: {
    heartRate: "Пульс", peak: "Найвышэйшыя запісаныя значэнні", average: "Найвышэйшае сярэдняе",
    empty: "Няма поўных даных пульсу для гэтай працягласці.",
    rule: "Вокны пачынаюцца ў запісаных кропках, могуць перакрывацца і паўтараць трэніроўку. Сярэднія ўключаюць спыненні; пропускі пульсу або інтэрвалы звыш 15 с выключаюць акно.",
    splits: "Адрэзкі па кіламетрах", split: "Адрэзак", distance: "Адлегласць", pace: "Тэмп са спыненнямі",
    averageHr: "Сярэдні пульс", maxHr: "Макс. пульс", splitsEmpty: "Няма прыдатных запісаў часу і адлегласці.",
    splitsNote: "Тэмп уключае спыненні. Пры недахопе зыходных даных часу або адлегласці адрэзак недаступны, нават калі згладжаныя графікі паказваюць вымярэнні. Сярэдні пульс узважаны па часе; няпоўныя даныя недаступныя. Максімум — з запісаных значэнняў.",
    selectionHelp: "Выберыце адрэзкі, каб вылучыць іх на ўсіх графіках; выберыце паўторна, каб прыбраць. Невядомыя часавыя межы нельга вылучыць на восі часу. Выбар часовы.",
  },
  it: {
    heartRate: "Frequenza cardiaca", peak: "Campioni registrati più alti", average: "Media più alta",
    empty: "Nessun dato FC completo per questa durata.",
    rule: "Le finestre iniziano ai campioni registrati e possono sovrapporsi o ripetere un’attività. Le medie includono le soste; FC mancante o intervalli oltre 15 s escludono la finestra.",
    splits: "Intertempi chilometrici", split: "Intertempo", distance: "Distanza", pace: "Passo trascorso",
    averageHr: "FC media", maxHr: "FC max", splitsEmpty: "Tempo e distanza registrati mancanti o inutilizzabili.",
    splitsNote: "Il passo include le soste. Dati originali di tempo o distanza mancanti rendono l’intertempo indisponibile, anche se i grafici smussati mostrano misure. La FC media è ponderata nel tempo; dati incompleti non sono disponibili. Il massimo usa campioni registrati.",
    selectionHelp: "Seleziona gli intertempi per evidenziarli su tutti i grafici; selezionali di nuovo per rimuoverli. I limiti temporali sconosciuti non possono essere evidenziati sull’asse del tempo. La selezione è temporanea.",
  },
};
