/**
 * Psychometric instrument banks. Items are plain SINGLE_CHOICE questions —
 * they ride the existing deterministic session flow unchanged; only scoring
 * (scoring.ts) is new.
 *
 * These are rule-based screening instruments with band interpretation, NOT
 * clinical norms. The UI states this explicitly. DISC is approximated via
 * agreement-rated statements rather than forced-choice — also disclosed.
 */

export type PsychometricBankId = "BIG_FIVE" | "DISC" | "REASONING";

export type PsychometricDimension = {
  key: string;
  label: string;
  description: string;
};

export type PsychometricItem = {
  text: string;
  /** Dimension key this item feeds. */
  dimension: string;
  options: string[];
  /** Keyed items (reasoning): index of the correct option. */
  correctIndex?: number;
  /** Likert items worded negatively — the score is inverted. */
  reverse?: boolean;
};

export type PsychometricBank = {
  id: PsychometricBankId;
  name: string;
  description: string;
  /** Likert banks score agreement (0-4 scaled); keyed banks score right/wrong. */
  keyed: boolean;
  dimensions: PsychometricDimension[];
  items: PsychometricItem[];
};

export const LIKERT_OPTIONS = [
  "Sangat tidak setuju",
  "Tidak setuju",
  "Netral",
  "Setuju",
  "Sangat setuju",
];

const BIG_FIVE_DIMENSIONS: PsychometricDimension[] = [
  {
    key: "OPENNESS",
    label: "Keterbukaan terhadap Pengalaman",
    description: "Rasa ingin tahu, imajinasi, dan keterbukaan terhadap pengalaman baru",
  },
  {
    key: "CONSCIENTIOUSNESS",
    label: "Ketelitian",
    description: "Keteraturan, keandalan, dan disiplin diri",
  },
  {
    key: "EXTRAVERSION",
    label: "Ekstraversi",
    description: "Kesukaan bersosialisasi, energi, dan ketegasan dalam situasi sosial",
  },
  {
    key: "AGREEABLENESS",
    label: "Kesepakatan",
    description: "Kerja sama, empati, dan kepedulian pada orang lain",
  },
  {
    key: "STABILITY",
    label: "Stabilitas Emosi",
    description: "Ketenangan dan ketahanan di bawah tekanan (neurotisisme rendah)",
  },
];

const BIG_FIVE_ITEMS: PsychometricItem[] = [
  // Openness (6)
  { text: "Saya cepat mencoba tool, metode, atau ide baru.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  { text: "Saya menikmati memecahkan masalah yang tidak punya jawaban jelas.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  { text: "Diskusi abstrak atau teoretis menarik bagi saya.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  { text: "Saya lebih menyukai rutinitas daripada bereksperimen dengan pendekatan baru.", dimension: "OPENNESS", options: LIKERT_OPTIONS, reverse: true },
  { text: "Saya sering melihat kaitan antara ide-ide yang tidak berhubungan.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  { text: "Perubahan membuat saya bersemangat, bukan gelisah.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  // Conscientiousness (6)
  { text: "Saya menyelesaikan apa yang saya mulai, meski prosesnya mulai terasa melelahkan.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  { text: "Saya menjaga pekerjaan saya tetap rapi dan mudah diikuti orang lain.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  { text: "Saya jarang melewatkan tenggat yang telah saya janjikan.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  { text: "Saya sering berimprovisasi alih-alih merencanakan lebih dulu.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS, reverse: true },
  { text: "Saya memeriksa ulang pekerjaan sebelum mengumpulkannya.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  { text: "Orang lain bisa mengandalkan saya tanpa perlu diingatkan.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  // Extraversion (6)
  { text: "Saya merasa berenergi setelah menghabiskan waktu bersama sekelompok orang.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS },
  { text: "Saya nyaman memulai percakapan dengan orang yang belum saya kenal.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS },
  { text: "Saya lebih suka bekerja sendiri daripada dalam tim.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS, reverse: true },
  { text: "Saya mudah menyampaikan pendapat dalam diskusi kelompok.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS },
  { text: "Acara sosial yang lama cepat membuat saya kehabisan energi.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS, reverse: true },
  { text: "Saya menikmati mempresentasikan pekerjaan saya di depan audiens.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS },
  // Agreeableness (6)
  { text: "Saya berusaha memahami sudut pandang lawan bicara sebelum tidak setuju.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS },
  { text: "Membantu rekan kerja sepadan meski mengganggu pekerjaan saya.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS },
  { text: "Saya mudah mengkritik orang secara langsung.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS, reverse: true },
  { text: "Saya berusaha ekstra menjaga hubungan tetap harmonis.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS },
  { text: "Sebagian besar orang bisa dipercaya melakukan hal yang benar.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS },
  { text: "Saya lebih memilih memenangkan perdebatan daripada menjaga hubungan.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS, reverse: true },
  // Emotional Stability (6)
  { text: "Saya tetap tenang saat rencana berubah di menit terakhir.", dimension: "STABILITY", options: LIKERT_OPTIONS },
  { text: "Saya jarang mengkhawatirkan hal yang di luar kendali saya.", dimension: "STABILITY", options: LIKERT_OPTIONS },
  { text: "Kegagalan kecil bisa merusak seluruh hari saya.", dimension: "STABILITY", options: LIKERT_OPTIONS, reverse: true },
  { text: "Di bawah tekanan, saya berpikir justru lebih jernih, bukan sebaliknya.", dimension: "STABILITY", options: LIKERT_OPTIONS },
  { text: "Saya sering merasa cemas tanpa alasan yang jelas.", dimension: "STABILITY", options: LIKERT_OPTIONS, reverse: true },
  { text: "Kritikan cepat lenyap dari pikiran saya.", dimension: "STABILITY", options: LIKERT_OPTIONS },
];

const DISC_DIMENSIONS: PsychometricDimension[] = [
  {
    key: "DOMINANCE",
    label: "Dominansi (D)",
    description: "Langsung, berorientasi hasil, nyaman memimpin",
  },
  {
    key: "INFLUENCE",
    label: "Pengaruh (I)",
    description: "Antusias, persuasif, berenergi dari orang lain",
  },
  {
    key: "STEADINESS",
    label: "Ketekunan (S)",
    description: "Sabar, dapat diandalkan, menghargai stabilitas dan keharmonisan",
  },
  {
    key: "COMPLIANCE",
    label: "Ketaatan (C)",
    description: "Teliti, analitis, menghargai akurasi dan kualitas",
  },
];

const DISC_ITEMS: PsychometricItem[] = [
  // Dominance (6)
  { text: "Saat kelompok kekurangan arah, saya secara alami mengambil pimpinan.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  { text: "Saya lebih memilih mengambil keputusan cepat daripada sempurna.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  { text: "Saya menikmati bernegosiasi dalam posisi yang sulit.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  { text: "Saya menghindari konflik meski tahu saya benar.", dimension: "DOMINANCE", options: LIKERT_OPTIONS, reverse: true },
  { text: "Diberi kewenangan memotivasi saya.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  { text: "Saya menantang keputusan yang tidak saya setujui, siapa pun pengambilnya.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  // Influence (6)
  { text: "Saya bisa membuat sebagian besar orang antusias terhadap sebuah ide.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "Saya berpikir sambil bersuara dan menikmati brainstorming kelompok.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "Bekerja sendirian dalam waktu lama menguras energi saya.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "Saya paling meyakinkan lewat cerita dan antusiasme, bukan data.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "Orang yang belum saya kenal terasa seperti teman yang belum bertemu.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "Saya menghindari menjadi pusat perhatian.", dimension: "INFLUENCE", options: LIKERT_OPTIONS, reverse: true },
  // Steadiness (6)
  { text: "Saya lebih menyukai proses yang sudah akrab daripada perubahan terus-menerus.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "Rekan kerja menggambarkan saya sebagai orang yang sabar dan pendengar yang baik.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "Saya tetap setia pada tim bahkan di masa sulit.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "Perubahan prioritas yang mendadak lebih membuat saya stres daripada kebanyakan orang.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "Saya meluangkan waktu agar orang lain merasa diterima.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "Saya lebih memilih merawat sebuah sistem daripada merombaknya.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  // Compliance (6)
  { text: "Saya memeriksa detail yang orang lain anggap sepele.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
  { text: "Aturan yang jelas justru membuat saya lebih efektif, bukan sebaliknya.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
  { text: "Saya memverifikasi fakta sebelum menyampaikannya ke orang lain.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
  { text: "Cukup mendekati tidak pernah cukup untuk pekerjaan saya.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
  { text: "Saya nyaman mengambil keputusan dengan data yang tidak lengkap.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS, reverse: true },
  { text: "Presisi lebih penting bagi saya daripada kecepatan.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
];

const REASONING_DIMENSIONS: PsychometricDimension[] = [
  {
    key: "NUMERICAL",
    label: "Penalaran Numerik",
    description: "Bekerja dengan angka, rasio, dan persentase",
  },
  {
    key: "LOGICAL",
    label: "Penalaran Logika",
    description: "Pola, barisan, dan aturan deduktif",
  },
  {
    key: "VERBAL",
    label: "Penalaran Verbal",
    description: "Makna kata, hubungan antarkata, dan pemahaman",
  },
];

const REASONING_ITEMS: PsychometricItem[] = [
  // Numerical (5)
  {
    text: "Sebuah kaus berharga $40 didiskon 25%. Berapa harga barunya?",
    dimension: "NUMERICAL",
    options: ["$25", "$30", "$32", "$35"],
    correctIndex: 1,
  },
  {
    text: "Jika 3 mesin menghasilkan 90 unit dalam satu jam, berapa unit yang dihasilkan 5 mesin dalam satu jam dengan laju yang sama?",
    dimension: "NUMERICAL",
    options: ["120", "135", "150", "180"],
    correctIndex: 2,
  },
  {
    text: "Sebuah harga naik dari $80 menjadi $100. Berapa persentase kenaikannya?",
    dimension: "NUMERICAL",
    options: ["20%", "25%", "30%", "80%"],
    correctIndex: 1,
  },
  {
    text: "Berapa rata-rata dari 7, 11, 15, dan 23?",
    dimension: "NUMERICAL",
    options: ["13", "14", "15", "16"],
    correctIndex: 1,
  },
  {
    text: "Jika sebuah kereta menempuh 240 km dalam 3 jam, seberapa jauh ia menempuh dalam 5 jam dengan kecepatan yang sama?",
    dimension: "NUMERICAL",
    options: ["360 km", "400 km", "420 km", "480 km"],
    correctIndex: 1,
  },
  // Logical (5)
  {
    text: "Apa angka berikutnya dalam barisan 2, 4, 8, 16, ...?",
    dimension: "LOGICAL",
    options: ["20", "24", "32", "64"],
    correctIndex: 2,
  },
  {
    text: "Semua bloops adalah razzies. Semua razzies adalah lazzies. Pernyataan mana yang pasti benar?",
    dimension: "LOGICAL",
    options: [
      "Semua bloops adalah lazzies",
      "Semua lazzies adalah bloops",
      "Hanya sebagian razzies yang merupakan bloops",
      "Tidak ada lazzies yang merupakan bloops",
    ],
    correctIndex: 0,
  },
  {
    text: "Jika A > B dan B > C, mana yang pasti benar?",
    dimension: "LOGICAL",
    options: ["A > C", "C > A", "A = C", "Tidak dapat ditentukan"],
    correctIndex: 0,
  },
  {
    text: "Apa angka berikutnya? 1, 1, 2, 3, 5, 8, ...",
    dimension: "LOGICAL",
    options: ["11", "12", "13", "15"],
    correctIndex: 2,
  },
  {
    text: "Setiap ujian di sekolah ini bersifat lisan. Sejarah adalah ujian di sekolah ini. Kesimpulannya:",
    dimension: "LOGICAL",
    options: [
      "Sejarah bersifat lisan",
      "Sejarah bersifat tertulis",
      "Sebagian ujian bersifat tertulis",
      "Tidak ada kesimpulan yang mungkin",
    ],
    correctIndex: 0,
  },
  // Verbal (5)
  {
    text: "Kata mana yang maknanya paling mirip dengan TEKUN?",
    dimension: "VERBAL",
    options: ["Lalai", "Rajin", "Cerewet", "Lambat"],
    correctIndex: 1,
  },
  {
    text: "Kata mana yang berlawanan makna dengan LANGKA?",
    dimension: "VERBAL",
    options: ["Jarang", "Melimpah", "Mahal", "Tersembunyi"],
    correctIndex: 1,
  },
  {
    text: "JARI berbanding TANGAN seperti JARI KAKI berbanding ...",
    dimension: "VERBAL",
    options: ["Kuku", "Sepatu", "KAKI", "Tungkai"],
    correctIndex: 2,
  },
  {
    text: "Pilih kata yang paling tepat melengkapi kalimat: Bukti itu _____, sehingga perkara ditolak.",
    dimension: "VERBAL",
    options: ["meyakinkan", "tidak memadai", "dapat diterima", "baru-baru ini"],
    correctIndex: 1,
  },
  {
    text: "Kata mana yang TIDAK termasuk bersama yang lain?",
    dimension: "VERBAL",
    options: ["Segitiga", "Persegi", "Lingkaran", "Segi lima"],
    correctIndex: 2,
  },
];

export const PSYCHOMETRIC_BANKS: Record<PsychometricBankId, PsychometricBank> = {
  BIG_FIVE: {
    id: "BIG_FIVE",
    name: "Big Five Personality (gaya BFI)",
    description:
      "30 pernyataan tingkat kesetujuan yang memprofilkan Keterbukaan terhadap Pengalaman, Ketelitian, Ekstraversi, Kesepakatan, dan Stabilitas Emosi.",
    keyed: false,
    dimensions: BIG_FIVE_DIMENSIONS,
    items: BIG_FIVE_ITEMS,
  },
  DISC: {
    id: "DISC",
    name: "Profil Gaya Kerja DISC",
    description:
      "24 pernyataan tingkat kesetujuan yang mendekati dimensi Dominansi, Pengaruh, Ketekunan, dan Ketaatan.",
    keyed: false,
    dimensions: DISC_DIMENSIONS,
    items: DISC_ITEMS,
  },
  REASONING: {
    id: "REASONING",
    name: "Tes Penalaran (Numerik · Logika · Verbal)",
    description:
      "15 soal berkunci jawaban yang mencakup penalaran numerik, logika, dan verbal.",
    keyed: true,
    dimensions: REASONING_DIMENSIONS,
    items: REASONING_ITEMS,
  },
};

export function getPsychometricBank(id: unknown): PsychometricBank | null {
  if (typeof id !== "string") return null;
  return (PSYCHOMETRIC_BANKS as Record<string, PsychometricBank>)[id] ?? null;
}
