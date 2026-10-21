import type { PsychometricBankId } from "./psychometric/banks";
import { PSYCHOMETRIC_BANKS } from "./psychometric/banks";

export interface TemplateQuestion {
  text: string;
  description?: string;
  type: "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH";
  options?: unknown;
  order: number;
  probeOnShort?: boolean;
  isRequired?: boolean;
}

export interface InterviewTemplate {
  id: string;
  title: string;
  description: string;
  objective: string;
  icon: string;
  aiTone: "CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY";
  followUpDepth: "LIGHT" | "MODERATE" | "DEEP";
  assessmentCriteria: { name: string; description: string }[];
  chatEnabled: boolean;
  voiceEnabled: boolean;
  videoEnabled: boolean;
  timeLimitMinutes?: number;
  questions: TemplateQuestion[];
  /** Psychometric presets run as deterministic ASSESSMENT sessions. */
  kind?: "INTERVIEW" | "ASSESSMENT";
  /** Deterministic instruments score without the LLM (no billing). */
  aiSummaryEnabled?: boolean;
  psychometricConfig?: { bankId: PsychometricBankId };
}

/** Build an ASSESSMENT template from a psychometric bank, items verbatim. */
function psychometricTemplate(
  bankId: PsychometricBankId,
  id: string,
  title: string,
  description: string,
  icon: string,
  timeLimitMinutes?: number,
): InterviewTemplate {
  const bank = PSYCHOMETRIC_BANKS[bankId];
  return {
    id,
    title,
    description,
    objective: `Menyelenggarakan instrumen screening ${bank.name} dan menghasilkan profil dimensi berbasis aturan untuk recruiter.`,
    icon,
    aiTone: "PROFESSIONAL",
    followUpDepth: "LIGHT",
    assessmentCriteria: bank.dimensions.map((d) => ({
      name: d.label,
      description: d.description,
    })),
    chatEnabled: true,
    voiceEnabled: false,
    videoEnabled: false,
    timeLimitMinutes,
    kind: "ASSESSMENT",
    aiSummaryEnabled: false,
    psychometricConfig: { bankId },
    questions: bank.items.map((item, i) => ({
      order: i,
      text: item.text,
      type: "SINGLE_CHOICE" as const,
      options: bank.keyed
        ? { options: item.options, correctIndices: [item.correctIndex ?? 0] }
        : { options: item.options },
      isRequired: true,
      probeOnShort: false,
    })),
  };
}

export const INTERVIEW_TEMPLATES: InterviewTemplate[] = [
  {
    id: "technical-screen",
    title: "Screening Teknis",
    description: "Menggali fundamental rekayasa perangkat lunak melalui campuran pertanyaan coding, desain sistem, dan pemecahan masalah.",
    objective: "Menilai kedalaman teknis kandidat, kemampuan coding, dan pendekatan desain sistem dalam format screening yang terstruktur.",
    icon: "Code2",
    aiTone: "PROFESSIONAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Pemecahan Masalah", description: "Kemampuan memecah masalah kompleks, mengidentifikasi edge case, dan mencapai solusi yang efisien." },
      { name: "Kualitas Kode", description: "Kode yang bersih dan mudah dibaca dengan penggunaan struktur data, algoritma, dan design pattern yang tepat." },
      { name: "Desain Sistem", description: "Pemahaman tentang arsitektur yang scalable, trade-off, dan interaksi antar komponen." },
      { name: "Komunikasi Teknis", description: "Kejelasan dalam menjelaskan keputusan teknis, trade-off, dan alasan di baliknya." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Ceritakan tentang proyek terbaru tempat Anda memecahkan masalah teknis yang menantang. Apa masalahnya, bagaimana pendekatan Anda, dan bagaimana hasilnya?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Diberikan sebuah array bilangan bulat, tulislah fungsi yang mengembalikan panjang barisan berurutan terpanjang. Misalnya, [100, 4, 200, 1, 3, 2] harus mengembalikan 4 (barisan 1, 2, 3, 4).", description: "Fokus pada time complexity — solusi O(n) diharapkan.", type: "CODING", probeOnShort: true, isRequired: true },
      { order: 2, text: "Bagaimana Anda mendesain layanan pemendek URL seperti bit.ly? Jelaskan komponen-komponen utamanya, strategi penyimpanan, dan cara menangani trafik tinggi.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Manakah yang paling tepat menggambarkan time complexity penyisipan elemen ke dalam binary search tree yang seimbang?", type: "SINGLE_CHOICE", options: [{ label: "O(1)", value: "O(1)" }, { label: "O(log n)", value: "O(log n)" }, { label: "O(n)", value: "O(n)" }, { label: "O(n log n)", value: "O(n log n)" }], isRequired: true },
      { order: 4, text: "Ceritakan pengalaman Anda dengan CI/CD pipeline. Bagaimana Anda memastikan kualitas kode dan deployment yang andal?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "behavioral",
    title: "Wawancara Perilaku",
    description: "Menggali keterampilan kepemimpinan, kerja sama tim, dan komunikasi melalui pertanyaan perilaku yang terstruktur.",
    objective: "Memahami perilaku kandidat di masa lalu dalam situasi profesional untuk memprediksi kinerja mendatang dalam kolaborasi, kepemimpinan, dan penyelesaian konflik.",
    icon: "Users",
    aiTone: "FRIENDLY",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Kepemimpinan", description: "Menunjukkan inisiatif, pengaruh, dan kemampuan mengarahkan orang lain menuju tujuan bersama." },
      { name: "Kerja Sama Tim & Kolaborasi", description: "Bekerja efektif dengan orang lain, berbagi kredit, dan menangani dinamika interpersonal dengan baik." },
      { name: "Adaptabilitas", description: "Menyikapi perubahan, umpan balik, dan situasi ambigu secara konstruktif." },
      { name: "Komunikasi", description: "Mengemukakan gagasan dengan jelas, mendengarkan secara aktif, dan menyesuaikan gaya dengan audiens." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Ceritakan tentang saat Anda harus memengaruhi sebuah keputusan tanpa memiliki kewenangan langsung. Bagaimana Anda menyikapinya?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Jelaskan situasi ketika Anda menerima umpan balik kritis. Bagaimana respons Anda, dan apa yang Anda ubah?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Beri contoh saat Anda harus mengelola prioritas yang saling bersaing dengan tenggat ketat. Trade-off apa yang Anda ambil?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Bagaimana Anda lebih suka menerima umpan balik dari atasan Anda?", type: "SINGLE_CHOICE", options: [{ label: "Rapat 1-on-1 rutin", value: "regular_1on1" }, { label: "Umpan balik tertulis setelah milestone", value: "written_milestones" }, { label: "Secara real-time, saat kejadian", value: "realtime" }, { label: "Review formal berkala", value: "formal_reviews" }], isRequired: true },
      { order: 4, text: "Ceritakan tentang proyek yang tidak berjalan sesuai rencana. Apa yang terjadi, dan apa yang akan Anda lakukan berbeda?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "user-research",
    title: "Riset Pengguna",
    description: "Menyingkap perilaku pengguna, pain point, dan kebutuhan yang belum terpenuhi melalui pertanyaan eksplorasi terbuka.",
    objective: "Memperoleh wawasan kualitatif mendalam tentang cara pengguna berinteraksi dengan produk, apa yang membuat frustrasi, dan peluang perbaikan apa saja yang ada.",
    icon: "Search",
    aiTone: "CASUAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Kedalaman Wawasan", description: "Memberikan contoh yang spesifik dan terperinci, bukan generalisasi yang samar tentang pengalamannya." },
      { name: "Kejelasan Pain Point", description: "Mengemukakan frustrasi dan kebutuhan yang belum terpenuhi dengan konteks yang konkret." },
      { name: "Kesadaran Alur Kerja", description: "Menunjukkan pemahaman atas proses, alat, dan workaround yang mereka gunakan sendiri." },
      { name: "Keterbukaan & Kejujuran", description: "Berbagi umpan balik yang jujur, termasuk pengalaman negatif, tanpa ragu." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Ceritakan tentang hari khas Anda saat menggunakan produk kami (atau alat serupa). Apa yang sedang ingin Anda capai?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Bagian mana dari alur kerja Anda saat ini yang paling membuat frustrasi? Bisakah Anda menjelaskan satu kejadian spesifik?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Jika Anda bisa mengubah satu hal pada produk ini, apa itu dan mengapa?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Saat ini bagaimana Anda mengatasi keterbatasan yang Anda temui? Jelaskan hack atau alat alternatif apa pun yang Anda pakai.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Apa yang akan membuat Anda merekomendasikan produk ini ke rekan kerja? Apa yang saat ini menahan Anda?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "case-study",
    title: "Studi Kasus",
    description: "Menguji pemikiran analitis dan pemecahan masalah terstruktur melalui skenario bisnis atau produk yang realistis.",
    objective: "Mengevaluasi kemampuan kandidat memecah masalah yang ambigu, menyusun pendekatan, dan mengomunikasikan rekomendasi dalam kondisi terbatas.",
    icon: "BrainCircuit",
    aiTone: "PROFESSIONAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Pemikiran Analitis", description: "Memecah masalah ambigu menjadi komponen terstruktur dan mengidentifikasi faktor kuncinya." },
      { name: "Prioritisasi", description: "Membedakan area berdampak besar dari hal yang tidak penting dan memfokuskan investigasi sesuai hal itu." },
      { name: "Kualitas Rekomendasi", description: "Mengusulkan solusi yang dapat ditindaklanjuti dan bernalar kuat, didukung data atau logika." },
      { name: "Komunikasi & Struktur", description: "Menyajikan analisis dalam kerangka yang jelas dan logis sehingga mudah diikuti." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 40,
    questions: [
      { order: 0, text: "Sebuah perusahaan e-commerce berukuran menengah mengalami penurunan conversion rate 15% dalam kuartal terakhir. Kerangka apa yang akan Anda pakai untuk mendiagnosis akar penyebabnya?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Berdasarkan skenario di atas, gambarlah decision tree atau diagram alir yang menunjukkan cara Anda memprioritaskan area mana yang diinvestigasi lebih dulu.", type: "WHITEBOARD", probeOnShort: true, isRequired: true },
      { order: 2, text: "Metrik mana yang akan Anda prioritaskan lebih dulu saat menginvestigasi penurunan conversion tersebut?", type: "MULTIPLE_CHOICE", options: [{ label: "Rincian sumber trafik", value: "traffic_source" }, { label: "Tingkat drop-off funnel per langkah", value: "funnel_dropoff" }, { label: "Tren nilai pesanan rata-rata", value: "aov_trend" }, { label: "Waktu muat halaman per perangkat", value: "page_load" }, { label: "Volume tiket customer support", value: "support_tickets" }], isRequired: true },
      { order: 3, text: "Misalkan analisis Anda menunjukkan tingkat abandonment checkout mobile naik 25%. Usulkan rencana konkret untuk menanganinya, termasuk apa yang akan Anda ukur untuk memvalidasi keberhasilannya.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "screening-call",
    title: "Panggilan Screening",
    description: "Screening awal singkat untuk memverifikasi kualifikasi dasar, motivasi, dan keterampilan komunikasi.",
    objective: "Menentukan secara efisien apakah kandidat memenuhi standar minimum untuk posisi dan layak lanjut ke tahap wawancara berikutnya.",
    icon: "Briefcase",
    aiTone: "FRIENDLY",
    followUpDepth: "LIGHT",
    assessmentCriteria: [
      { name: "Kesesuaian Posisi", description: "Latar belakang dan pengalaman sejalan dengan kebutuhan inti posisi." },
      { name: "Motivasi", description: "Menunjukkan ketertarikan tulus pada posisi dan alasan melamar yang jelas." },
      { name: "Komunikasi", description: "Menyampaikan gagasan dengan ringkas dan profesional dalam suasana percakapan." },
      { name: "Ketersediaan & Logistik", description: "Linimasa, ekspektasi gaji, dan preferensi pengaturan kerja kompatibel." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 20,
    questions: [
      { order: 0, text: "Ceritakan singkat latar belakang Anda dan apa yang menarik Anda pada posisi ini.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Apa status pekerjaan Anda saat ini?", type: "SINGLE_CHOICE", options: [{ label: "Bekerja — aktif mencari", value: "employed_looking" }, { label: "Bekerja — terbuka pada peluang", value: "employed_open" }, { label: "Sedang tidak bekerja", value: "between_roles" }, { label: "Freelance / kontrak", value: "freelancing" }], isRequired: true },
      { order: 2, text: "Berapa ekspektasi gaji Anda untuk posisi ini?", type: "OPEN_ENDED", probeOnShort: false, isRequired: true },
      { order: 3, text: "Kapan Anda bisa mulai bekerja jika ditawari posisi ini?", type: "OPEN_ENDED", probeOnShort: false, isRequired: true },
      { order: 4, text: "Apakah ada hal tentang posisi atau perusahaan yang ingin Anda tanyakan?", type: "OPEN_ENDED", probeOnShort: false, isRequired: false },
    ],
  },
  {
    id: "system-design",
    title: "Desain Sistem",
    description: "Menilai pemikiran arsitektur pada skala besar: komponen, aliran data, trade-off, dan mode kegagalan.",
    objective: "Mengevaluasi kemampuan kandidat mendesain sistem berskala besar, menjawab trade-off, dan bernalar tentang skalabilitas serta keandalan.",
    icon: "Network",
    aiTone: "PROFESSIONAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Arsitektur & Trade-off", description: "Mengusulkan pemecahan komponen yang masuk akal dan menjelaskan trade-off di balik setiap pilihan." },
      { name: "Skalabilitas & Bottleneck", description: "Mengidentifikasi apa yang rusak lebih dulu di bawah beban dan cara menskalakan storage, compute, dan delivery." },
      { name: "Keandalan & Mode Kegagalan", description: "Bernalar tentang kegagalan sebagian, retry, konsistensi, dan mode terdegradasi." },
      { name: "Komunikasi & Struktur", description: "Memandu percakapan desain dalam langkah yang jelas dan berurutan serta menyatakan asumsi." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 45,
    questions: [
      { order: 0, text: "Desainlah backend untuk aplikasi chat seperti WhatsApp: pesan satu-lawan-satu dan grup, terkirim ke berbagai perangkat. Ceritakan komponen-komponen utamanya dan bagaimana sebuah pesan mengalir dari pengirim ke penerima.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Gambarlah arsitektur tingkat tinggi untuk sistem chat di atas — layanan, data store, dan koneksi di antara komponennya.", type: "WHITEBOARD", probeOnShort: true, isRequired: true },
      { order: 2, text: "Sekarang aplikasinya memiliki 100 juta pengguna aktif harian. Di mana desain Anda rusak lebih dulu, dan apa yang akan Anda ubah agar tetap cepat?", description: "Cari keputusan soal caching, sharding, dan queueing.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Storage engine mana yang akan Anda pilih untuk penyimpanan riwayat pesan, dan mengapa?", type: "SINGLE_CHOICE", options: [{ label: "Database relasional (PostgreSQL/MySQL)", value: "sql" }, { label: "Wide-column store (Cassandra/ScyllaDB)", value: "wide_column" }, { label: "In-memory store (Redis)", value: "redis" }, { label: "Document store (MongoDB)", value: "document" }], isRequired: true },
      { order: 4, text: "Bagaimana Anda menjamin sebuah pesan tidak pernah hilang tanpa jejak — misalnya saat network partition atau server crash?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "culture-fit",
    title: "Kecocokan Budaya",
    description: "Menggali nilai, gaya kerja, dan motivasi untuk melihat bagaimana seseorang berkembang di lingkungan Anda.",
    objective: "Memahami kondisi kerja, nilai, dan dinamika tim apa yang menghasilkan kinerja terbaik kandidat, serta apakah hal itu selaras dengan budaya perusahaan.",
    icon: "HeartHandshake",
    aiTone: "FRIENDLY",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Kesesuaian Nilai", description: "Nilai dan etika personal konsisten dengan cara perusahaan beroperasi." },
      { name: "Gaya Kerja", description: "Preferensi soal otonomi, struktur, dan tempo sesuai cara kerja tim." },
      { name: "Gaya Kolaborasi", description: "Memberi dan menerima umpan balik dengan baik; menangani perbedaan pendapat secara konstruktif." },
      { name: "Motivasi & Keterlibatan", description: "Pendorong tulus yang akan menjaga keterlibatannya di posisi spesifik ini." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 25,
    questions: [
      { order: 0, text: "Jenis lingkungan kerja apa yang menghasilkan kinerja terbaik Anda? Jelaskan suasana kerja yang membuat Anda merasa berkinerja terbaik.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Ceritakan tentang satu nilai perusahaan — yang dinyatakan maupun tidak — yang sangat Anda setujui atau tolak di tempat kerja sebelumnya.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Mana yang paling penting bagi Anda di posisi berikutnya? Pilih semua yang berlaku.", type: "MULTIPLE_CHOICE", options: [{ label: "Otonomi atas cara saya bekerja", value: "autonomy" }, { label: "Mentorship yang kuat", value: "mentorship" }, { label: "Misi yang saya yakini", value: "mission" }, { label: "Stabilitas dan keterdugaan", value: "stability" }, { label: "Pertumbuhan dan pembelajaran yang cepat", value: "growth" }, { label: "Kompensasi dan benefit", value: "compensation" }], isRequired: true },
      { order: 3, text: "Jelaskan cara Anda suka berkolaborasi dengan tim — bagaimana Anda menangani perbedaan pendapat dengan rekan tim atau atasan?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Apa yang benar-benar memotivasi Anda sehari-hari — di luar gaji dan jabatan?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "final-round",
    title: "Putaran Akhir (Hiring Manager)",
    description: "Percakapan penutup dengan pengambil keputusan: ekspektasi posisi, rencana 90 hari pertama, dan kecocokan dua arah.",
    objective: "Menyelaraskan ekspektasi posisi, mengevaluasi cara kandidat menyikapi bulan-bulan pertama, dan mengungkap kekhawatiran yang tersisa sebelum keputusan penawaran.",
    icon: "UserCheck",
    aiTone: "PROFESSIONAL",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Kejelasan Posisi", description: "Memahami tuntutan posisi dan mampu menghubungkan pengalamannya dengan posisi tersebut." },
      { name: "Pemikiran 90 Hari Pertama", description: "Memiliki gambaran realistis dan terprioritisasi tentang cara memulai." },
      { name: "Penilaian Strategis", description: "Berpikir melampaui daftar tugasnya tentang tim dan produk." },
      { name: "Kecocokan Dua Arah", description: "Terbuka membahas keraguan, ekspektasi, dan detail penawaran." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 40,
    questions: [
      { order: 0, text: "Kita mendekati akhir proses. Apa yang Anda cari di posisi berikutnya, dan mengapa perusahaan ini secara khusus?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Bayangkan ini hari pertama Anda. Bagaimana Anda menghabiskan 90 hari pertama — apa yang akan Anda prioritaskan, dan seperti apa 'berhasil' menurut Anda?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Ceritakan tentang satu keputusan di posisi terakhir Anda yang akan Anda ambil secara berbeda dari tim atau perusahaan. Mengapa?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Apa yang akan membuat Anda menolak tawaran dari kami — apakah ada yang membuat Anda ragu saat ini?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Apakah ada hal tentang tim, posisi, atau perusahaan yang masih ingin Anda ketahui?", type: "OPEN_ENDED", probeOnShort: false, isRequired: false },
    ],
  },
  {
    id: "leadership",
    title: "Wawancara Kepemimpinan",
    description: "Mengevaluasi kepemimpinan orang, penilaian strategis, dan pemikiran organisasi untuk posisi manager ke atas.",
    objective: "Menilai cara kandidat membangun dan menskalakan tim, mengambil keputusan yang tidak populer, mengembangkan talenta senior, dan menyelaraskan stakeholder.",
    icon: "Compass",
    aiTone: "PROFESSIONAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Kepemimpinan Orang", description: "Membangun kepercayaan, menetapkan arah, dan mengembangkan orang-orang yang dikelolanya." },
      { name: "Penilaian Strategis", description: "Mengambil keputusan tepat di tengah ketidakpastian dan mengomunikasikannya dengan jelas." },
      { name: "Membangun Tim", description: "Merekrut, mengembangkan, dan — bila perlu — berpisah dengan orang secara konstruktif." },
      { name: "Penyelarasan Stakeholder", description: "Menyelaraskan pihak yang berkonflik di sekitar tujuan bersama tanpa hanya mengandalkan kewenangan." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 45,
    questions: [
      { order: 0, text: "Ceritakan tentang tim terbesar yang pernah Anda bangun atau pimpin. Apa misinya, dan apa tantangan pertumbuhan tersulitnya?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Jelaskan satu keputusan yang Anda ambil dan tidak populer di tim atau rekan sejawat Anda. Bagaimana Anda memutuskan, dan bagaimana Anda mengomunikasikannya?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Ceritakan tentang orang senior yang kinerjanya di bawah standar. Apa yang Anda lakukan, dan bagaimana akhirnya?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Ceritakan tentang saat Anda harus menyelaraskan stakeholder dengan tujuan yang berbenturan — misalnya product, sales, dan engineering. Bagaimana pendekatan Anda?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Bagaimana Anda lebih suka menjalankan ritme operasional tim Anda?", type: "SINGLE_CHOICE", options: [{ label: "1-on-1 mingguan plus target kuartalan", value: "weekly_okr" }, { label: "Seremoni berbasis sprint dan standup", value: "sprints" }, { label: "Async-first, pembaruan tertulis", value: "async_written" }, { label: "Ad-hoc, mengikuti pekerjaan yang sedang berjalan", value: "adhoc" }], isRequired: true },
    ],
  },
  {
    id: "internship",
    title: "Magang / Level Awal",
    description: "Screening ramah untuk kandidat awal karier: fundamental, kelincahan belajar, dan motivasi lebih diutamakan daripada pengalaman.",
    objective: "Mengidentifikasi kandidat berpotensi tinggi dengan fundamental kuat, rasa ingin tahu, dan dorongan, tanpa menuntut pengalaman profesional.",
    icon: "GraduationCap",
    aiTone: "FRIENDLY",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Kelincahan Belajar", description: "Cepat menguasai keterampilan baru dan mampu menjelaskan cara mereka belajar." },
      { name: "Fundamental", description: "Pemahaman kokoh atas konsep inti dari kuliah, proyek, atau belajar mandiri." },
      { name: "Inisiatif", description: "Membangun, ikut serta, atau menyelesaikan hal di luar yang diwajibkan." },
      { name: "Motivasi", description: "Alasan yang jelas dan tulus untuk bidang ini dan magang ini." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 25,
    questions: [
      { order: 0, text: "Ceritakan tentang apa yang sedang (atau baru saja) Anda pelajari dan apa yang paling membuat Anda bersemangat di bidang ini.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Ceritakan tentang proyek yang Anda banggakan — tugas kuliah, proyek pribadi, atau kegiatan organisasi. Apa bagian Anda dan bagaimana hasilnya?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Ceritakan tentang saat Anda harus mempelajari sesuatu yang baru dengan cepat — sebuah tool, bahasa, atau konsep. Bagaimana cara Anda melakukannya?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Seberapa akrab Anda dengan tech stack atau industri kami?", type: "SINGLE_CHOICE", options: [{ label: "Pernah memakainya di proyek atau tugas kuliah", value: "used" }, { label: "Pernah mempelajarinya tapi belum membangun dengannya", value: "studied" }, { label: "Pernah dengar, pengalaman terbatas", value: "heard" }, { label: "Baru bagi saya", value: "new" }], isRequired: true },
      { order: 4, text: "Apa yang ingin Anda dapatkan dari magang ini, dan ke mana Anda melihat diri Anda setelah lulus?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "customer-discovery",
    title: "Discovery Pelanggan",
    description: "Memvalidasi masalah sebelum produk: cerita nyata, workaround saat ini, dan urgensi — bukan daftar keinginan fitur.",
    objective: "Memahami masalah pelanggan dari pengalaman nyatanya: seberapa sering terjadi, bagaimana mereka mengatasinya saat ini, dan apakah penyelesaiannya cukup penting hingga layak dibayar.",
    icon: "Lightbulb",
    aiTone: "CASUAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Validasi Masalah", description: "Menjelaskan kejadian masalah yang konkret dan baru-baru ini — bukan hipotesis." },
      { name: "Alternatif Saat Ini", description: "Jelas tentang apa yang mereka pakai atau lakukan hari ini untuk mengatasi, termasuk workaround." },
      { name: "Kesediaan Membayar", description: "Pernah mengeluarkan uang atau upaya signifikan untuk menyelesaikan masalah ini." },
      { name: "Spesifisitas", description: "Jawaban spesifik dan terperinci, bukan generalitas yang sopan." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Ingatlah saat terakhir Anda mengalami masalah ini. Ceritakan persis apa yang terjadi — apa yang sedang Anda coba lakukan, dan apa yang salah?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Bagaimana Anda menangani masalah ini hari ini? Perlihatkan tool, spreadsheet, atau workaround yang Anda pakai.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Apakah Anda pernah membayar sesuatu untuk menyelesaikan ini — sebuah tool, layanan, atau orang baru? Apa yang terjadi?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Seberapa besar masalah ini bagi Anda saat ini?", type: "SINGLE_CHOICE", options: [{ label: "Sering menghentikan pekerjaan saya", value: "blocking" }, { label: "Sering mengganggu, saya pakai cara sendiri", value: "annoying" }, { label: "Sesekali mengganggu", value: "occasional" }, { label: "Jujur saja, bukan masalah berarti", value: "not_a_problem" }], isRequired: true },
      { order: 4, text: "Jika ada solusi yang bekerja persis seperti yang Anda inginkan, apa yang benar-benar akan membuat Anda beralih ke sana?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "product-feedback",
    title: "Umpan Balik Produk",
    description: "Umpan balik terstruktur dari pengguna aktif maupun yang berhenti: kedalaman pemakaian, titik gesekan, dan apa yang perlu diperbaiki lebih dulu.",
    objective: "Mengumpulkan umpan balik jujur dan spesifik tentang cara produk dipakai, di mana ia membuat frustrasi, dan apa yang akan meningkatkan retensi serta dukungan pengguna.",
    icon: "Star",
    aiTone: "CASUAL",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Kedalaman Pemakaian", description: "Menyingkap bagaimana produk benar-benar masuk dalam rutinitas mereka, di luar daftar fitur." },
      { name: "Titik Gesekan", description: "Menunjuk momen frustrasi yang spesifik dengan contoh konkret." },
      { name: "Sumber Nilai", description: "Mengemukakan apa yang benar-benar akan dirindukan jika produk hilang." },
      { name: "Saran yang Dapat Ditindaklanjuti", description: "Menawarkan perbaikan yang berakar pada pemakaian nyata, bukan daftar keinginan." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 20,
    questions: [
      { order: 0, text: "Seberapa sering Anda menggunakan produk ini?", type: "SINGLE_CHOICE", options: [{ label: "Setiap hari", value: "daily" }, { label: "Beberapa kali seminggu", value: "weekly" }, { label: "Beberapa kali sebulan", value: "monthly" }, { label: "Jarang atau baru sekadar mencoba", value: "rarely" }], isRequired: true },
      { order: 1, text: "Untuk apa Anda terutama menggunakan produk ini, dan nilai apa yang diberikannya dalam hari Anda?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Ingatlah saat terakhir produk ini membuat Anda frustrasi. Apa yang sedang Anda coba lakukan, dan apa yang terjadi?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Jika produk ini hilang besok, fitur apa yang paling akan Anda rindukan — dan mana yang paling tidak?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Jika Anda bisa mengubah satu hal pada produk ini, apa itu? Apakah Anda akan merekomendasikannya ke rekan kerja — mengapa atau mengapa tidak?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "sales-discovery",
    title: "Panggilan Discovery Sales",
    description: "Kualifikasi inbound leads dengan pendekatan BANT: kebutuhan, anggaran, proses keputusan, dan linimasa — secara percakapan.",
    objective: "Mengualifikasi kebutuhan, anggaran, kewenangan, dan linimasa calon pelanggan sambil membangun kedekatan dan menggali seperti apa kesuksesan bagi mereka.",
    icon: "TrendingUp",
    aiTone: "PROFESSIONAL",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Identifikasi Kebutuhan", description: "Masalah dan dampak bisnisnya konkret dan terukur." },
      { name: "Anggaran & Kewenangan", description: "Rentang anggaran dan pengambil keputusan sebenarnya sudah terungkap." },
      { name: "Linimasa & Urgensi", description: "Alasan dan tanggal yang kredibel untuk membeli sekarang vs nanti." },
      { name: "Kualifikasi Kesesuaian", description: "Use case, ukuran, dan ekspektasi sesuai dengan apa yang produk berikan." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Terima kasih atas ketertarikannya. Ceritakan sedikit tentang tim Anda serta proses atau alat yang dipakai saat ini di area ini.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Apa yang membuat Anda mulai mencari solusi sekarang — adakah pemicu atau kejadian spesifik?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Kapan rencana Anda mengambil keputusan?", type: "SINGLE_CHOICE", options: [{ label: "Dalam sebulan", value: "this_month" }, { label: "Kuartal ini", value: "this_quarter" }, { label: "6 bulan ke depan", value: "six_months" }, { label: "Baru mengeksplorasi saja", value: "exploring" }], isRequired: true },
      { order: 3, text: "Siapa lagi yang terlibat dalam keputusan ini, dan apakah Anda sudah memiliki rentang anggaran untuk menyelesaikan ini?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Enam bulan setelah menerapkan solusi — seperti apa kesuksesan bagi Anda secara konkret?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "exit-interview",
    title: "Wawancara Exit",
    description: "Percakapan offboarding yang mengungkap alasan perpisahan yang jujur dan masukan organisasi yang dapat ditindaklanjuti.",
    objective: "Memahami mengapa karyawan pergi, bagaimana pengalaman mereka dengan atasan dan tim, serta apa yang harus diubah organisasi — sambil mengakhiri hubungan dengan baik.",
    icon: "DoorOpen",
    aiTone: "FRIENDLY",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Alasan Pergi", description: "Alasan pergi yang sebenarnya dan terurut prioritasnya — bukan sekadar yang sopan." },
      { name: "Pengalaman dengan Atasan & Tim", description: "Penilaian jujur atas dukungan harian, umpan balik, dan budaya." },
      { name: "Faktor Retensi", description: "Apa yang seharusnya bisa menahan mereka — kompensasi, pertumbuhan, posisi, atau manajemen." },
      { name: "Umpan Balik yang Dapat Ditindaklanjuti", description: "Saran konkret lanjutkan/mulai/berhenti yang bisa ditindaklanjuti perusahaan." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Selamat untuk langkah berikutnya. Apa alasan utama Anda memutuskan untuk pergi, dan adakah faktor pendukung lainnya?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Melihat ke belakang, adakah hal yang bisa mengubah keputusan Anda — pada posisi, tim, atau kompensasi?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Seberapa didukung Anda merasa oleh atasan selama bekerja di sini?", type: "SINGLE_CHOICE", options: [{ label: "Sangat didukung", value: "very_supported" }, { label: "Cukup didukung", value: "somewhat" }, { label: "Kurang didukung", value: "not_supported" }, { label: "Lebih memilih tidak menjawab", value: "skip" }], isRequired: true },
      { order: 3, text: "Apa yang sebaiknya perusahaan lanjutkan, mulai, dan hentikan? Sampaikan sejujur-jujurnya — semuanya tetap rahasia.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Apakah Anda akan merekomendasikan bekerja di sini ke teman, dan apakah Anda akan mempertimbangkan kembali di masa depan? Ada lagi yang ingin Anda sampaikan?", type: "OPEN_ENDED", probeOnShort: false, isRequired: false },
    ],
  },

  // ── Psychometric presets (deterministic ASSESSMENT sessions) ──────
  psychometricTemplate(
    "BIG_FIVE",
    "psychometric-big-five",
    "Psikotes: Big Five Personality",
    "30 pernyataan tingkat persetujuan yang memprofilkan Keterbukaan terhadap Pengalaman, Ketelitian, Ekstraversi, Kesepakatan, dan Stabilitas Emosi. Skor dihitung otomatis — tanpa AI, hasil langsung final.",
    "BrainCircuit",
    20,
  ),
  psychometricTemplate(
    "DISC",
    "psychometric-disc",
    "Psikotes: DISC Work Style",
    "24 pernyataan yang mendekati Dominansi, Pengaruh, Ketekunan, dan Ketaatan. Penilaian berbasis aturan dengan rentang hasil screening — pembacaan akhir ada pada recruiter.",
    "Compass",
    15,
  ),
  psychometricTemplate(
    "REASONING",
    "psychometric-reasoning",
    "Psikotes: Penalaran (Numerik · Logika · Verbal)",
    "15 soal berkunci mencakup penalaran numerik, logika, dan verbal. Penilaian objektif benar/salah — hasil langsung final.",
    "TrendingUp",
    20,
  ),
];
