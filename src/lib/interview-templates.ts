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
    objective: `Administer the ${bank.name} screening instrument and produce a rule-based dimension profile for the recruiter.`,
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
    title: "Technical Screen",
    description: "Evaluate software engineering fundamentals with a mix of coding, system design, and problem-solving questions.",
    objective: "Assess the candidate's technical depth, coding ability, and approach to system design within a structured screening format.",
    icon: "Code2",
    aiTone: "PROFESSIONAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Problem Solving", description: "Ability to break down complex problems, identify edge cases, and arrive at efficient solutions." },
      { name: "Code Quality", description: "Clean, readable code with appropriate use of data structures, algorithms, and design patterns." },
      { name: "System Design", description: "Understanding of scalable architecture, trade-offs, and component interactions." },
      { name: "Technical Communication", description: "Clarity in explaining technical decisions, trade-offs, and reasoning." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Walk me through a recent project where you solved a challenging technical problem. What was the problem, your approach, and the outcome?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Given an array of integers, write a function that returns the length of the longest consecutive sequence. For example, [100, 4, 200, 1, 3, 2] should return 4 (the sequence 1, 2, 3, 4).", description: "Focus on time complexity — an O(n) solution is expected.", type: "CODING", probeOnShort: true, isRequired: true },
      { order: 2, text: "How would you design a URL shortening service like bit.ly? Describe the key components, storage strategy, and how you would handle high traffic.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Which of the following best describes the time complexity of inserting an element into a balanced binary search tree?", type: "SINGLE_CHOICE", options: [{ label: "O(1)", value: "O(1)" }, { label: "O(log n)", value: "O(log n)" }, { label: "O(n)", value: "O(n)" }, { label: "O(n log n)", value: "O(n log n)" }], isRequired: true },
      { order: 4, text: "Describe your experience with CI/CD pipelines. How do you ensure code quality and reliable deployments?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "behavioral",
    title: "Behavioral Interview",
    description: "Explore leadership, teamwork, and communication skills through structured behavioral questions.",
    objective: "Understand the candidate's past behavior in professional situations to predict future performance in collaboration, leadership, and conflict resolution.",
    icon: "Users",
    aiTone: "FRIENDLY",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Leadership", description: "Demonstrates initiative, influence, and the ability to guide others toward shared goals." },
      { name: "Teamwork & Collaboration", description: "Works effectively with others, shares credit, and navigates interpersonal dynamics." },
      { name: "Adaptability", description: "Responds constructively to change, feedback, and ambiguous situations." },
      { name: "Communication", description: "Articulates ideas clearly, listens actively, and adjusts style to the audience." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Tell me about a time you had to influence a decision without having direct authority. How did you approach it?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Describe a situation where you received critical feedback. How did you respond, and what did you change?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Give an example of a time you had to manage competing priorities with a tight deadline. What trade-offs did you make?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "How do you prefer to receive feedback from your manager?", type: "SINGLE_CHOICE", options: [{ label: "Regular 1-on-1 meetings", value: "regular_1on1" }, { label: "Written feedback after milestones", value: "written_milestones" }, { label: "Real-time, in the moment", value: "realtime" }, { label: "Formal periodic reviews", value: "formal_reviews" }], isRequired: true },
      { order: 4, text: "Tell me about a project that didn't go as planned. What happened, and what would you do differently?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "user-research",
    title: "User Research",
    description: "Uncover user behaviors, pain points, and unmet needs through open-ended discovery questions.",
    objective: "Gain deep qualitative insights into how users interact with the product, what frustrates them, and what opportunities exist for improvement.",
    icon: "Search",
    aiTone: "CASUAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Depth of Insight", description: "Provides specific, detailed examples rather than vague generalizations about their experience." },
      { name: "Pain Point Clarity", description: "Clearly articulates frustrations and unmet needs with concrete context." },
      { name: "Workflow Awareness", description: "Demonstrates understanding of their own processes, tools, and workarounds." },
      { name: "Openness & Honesty", description: "Shares genuine feedback, including negative experiences, without hesitation." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Walk me through a typical day when you use our product (or a similar tool). What are you trying to accomplish?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "What's the most frustrating part of your current workflow? Can you describe a specific instance?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "If you could change one thing about the product, what would it be and why?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "How do you currently work around limitations you've encountered? Describe any hacks or alternative tools you use.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "What would make you recommend this product to a colleague? What's currently holding you back?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "case-study",
    title: "Case Study",
    description: "Test analytical thinking and structured problem-solving through a realistic business or product scenario.",
    objective: "Evaluate the candidate's ability to break down ambiguous problems, structure an approach, and communicate a recommendation under constraints.",
    icon: "BrainCircuit",
    aiTone: "PROFESSIONAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Analytical Thinking", description: "Breaks down ambiguous problems into structured components and identifies key drivers." },
      { name: "Prioritization", description: "Distinguishes high-impact areas from noise and focuses investigation accordingly." },
      { name: "Recommendation Quality", description: "Proposes actionable, well-reasoned solutions backed by data or logic." },
      { name: "Communication & Structure", description: "Presents analysis in a clear, logical framework that is easy to follow." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 40,
    questions: [
      { order: 0, text: "A mid-size e-commerce company has seen a 15% drop in conversion rate over the last quarter. What framework would you use to diagnose the root cause?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Based on the scenario above, sketch a decision tree or flow diagram showing how you would prioritize which areas to investigate first.", type: "WHITEBOARD", probeOnShort: true, isRequired: true },
      { order: 2, text: "Which of the following metrics would you prioritize first when investigating the conversion drop?", type: "MULTIPLE_CHOICE", options: [{ label: "Traffic source breakdown", value: "traffic_source" }, { label: "Funnel drop-off rates by step", value: "funnel_dropoff" }, { label: "Average order value trend", value: "aov_trend" }, { label: "Page load time by device", value: "page_load" }, { label: "Customer support ticket volume", value: "support_tickets" }], isRequired: true },
      { order: 3, text: "Suppose your analysis reveals that mobile checkout abandonment increased 25%. Propose a concrete plan to address this, including what you'd measure to validate success.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "screening-call",
    title: "Screening Call",
    description: "A quick initial screen to verify basic qualifications, motivation, and communication skills.",
    objective: "Efficiently determine whether the candidate meets the minimum bar for the role and should advance to the next interview stage.",
    icon: "Briefcase",
    aiTone: "FRIENDLY",
    followUpDepth: "LIGHT",
    assessmentCriteria: [
      { name: "Role Fit", description: "Background and experience align with the position's core requirements." },
      { name: "Motivation", description: "Demonstrates genuine interest in the role and a clear reason for applying." },
      { name: "Communication", description: "Expresses ideas concisely and professionally in a conversational setting." },
      { name: "Availability & Logistics", description: "Timeline, salary expectations, and work arrangement preferences are compatible." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 20,
    questions: [
      { order: 0, text: "Tell me briefly about your background and what drew you to this role.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "What is your current employment status?", type: "SINGLE_CHOICE", options: [{ label: "Employed — actively looking", value: "employed_looking" }, { label: "Employed — open to opportunities", value: "employed_open" }, { label: "Between roles", value: "between_roles" }, { label: "Freelancing / contracting", value: "freelancing" }], isRequired: true },
      { order: 2, text: "What are your salary expectations for this role?", type: "OPEN_ENDED", probeOnShort: false, isRequired: true },
      { order: 3, text: "When would you be available to start if offered the position?", type: "OPEN_ENDED", probeOnShort: false, isRequired: true },
      { order: 4, text: "Is there anything about the role or company you'd like to ask about?", type: "OPEN_ENDED", probeOnShort: false, isRequired: false },
    ],
  },
  {
    id: "system-design",
    title: "System Design",
    description: "Assess architectural thinking at scale: components, data flow, trade-offs, and failure modes.",
    objective: "Evaluate the candidate's ability to design large-scale systems, justify trade-offs, and reason about scalability and reliability.",
    icon: "Network",
    aiTone: "PROFESSIONAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Architecture & Trade-offs", description: "Proposes a sensible component breakdown and articulates the trade-offs behind each choice." },
      { name: "Scalability & Bottlenecks", description: "Identifies what breaks first under load and how to scale storage, compute, and delivery." },
      { name: "Reliability & Failure Modes", description: "Reasons about partial failure, retries, consistency, and degraded modes." },
      { name: "Communication & Structure", description: "Drives the design conversation in clear, ordered steps and states assumptions." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 45,
    questions: [
      { order: 0, text: "Design the backend for a chat application like WhatsApp: one-on-one and group messaging, delivered across devices. Walk me through the key components and how a message flows from sender to recipient.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Sketch the high-level architecture for the chat system above — services, data stores, and the connections between them.", type: "WHITEBOARD", probeOnShort: true, isRequired: true },
      { order: 2, text: "Now the app has 100 million daily active users. Where does your design break first, and what would you change to keep it fast?", description: "Look for caching, sharding, and queueing decisions.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Which storage engine would you choose for the message history store, and why?", type: "SINGLE_CHOICE", options: [{ label: "Relational database (PostgreSQL/MySQL)", value: "sql" }, { label: "Wide-column store (Cassandra/ScyllaDB)", value: "wide_column" }, { label: "In-memory store (Redis)", value: "redis" }, { label: "Document store (MongoDB)", value: "document" }], isRequired: true },
      { order: 4, text: "How would you guarantee a message is never silently lost — say, during a network partition or a server crash?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "culture-fit",
    title: "Culture Fit",
    description: "Explore values, work style, and motivation to see how someone thrives in your environment.",
    objective: "Understand what working conditions, values, and team dynamics bring out the candidate's best work, and whether they align with the company culture.",
    icon: "HeartHandshake",
    aiTone: "FRIENDLY",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Values Alignment", description: "Personal values and ethics are consistent with how the company operates." },
      { name: "Work Style", description: "Preferences around autonomy, structure, and pace fit the team's way of working." },
      { name: "Collaboration Style", description: "Gives and receives feedback well; handles disagreement constructively." },
      { name: "Motivation & Engagement", description: "Genuine drivers that will keep them engaged in this specific role." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 25,
    questions: [
      { order: 0, text: "What kind of work environment brings out your best work? Describe a setup where you felt you did your best.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Tell me about a company value — stated or unstated — that you strongly agreed or disagreed with at a past employer.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Which of these matter most to you in your next role? Pick all that apply.", type: "MULTIPLE_CHOICE", options: [{ label: "Autonomy over how I work", value: "autonomy" }, { label: "Strong mentorship", value: "mentorship" }, { label: "Mission I believe in", value: "mission" }, { label: "Stability and predictability", value: "stability" }, { label: "Fast growth and learning", value: "growth" }, { label: "Compensation and benefits", value: "compensation" }], isRequired: true },
      { order: 3, text: "Describe how you like to collaborate with your team — how do you handle disagreement with a teammate or your manager?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "What genuinely motivates you day to day — beyond salary and title?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "final-round",
    title: "Final Round (Hiring Manager)",
    description: "A closing conversation with the decision maker: role expectations, first-90-days plan, and mutual fit.",
    objective: "Align on role expectations, evaluate how the candidate would approach the first months, and surface any remaining concerns before the offer decision.",
    icon: "UserCheck",
    aiTone: "PROFESSIONAL",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Role Clarity", description: "Understands what the role demands and can connect their experience to it." },
      { name: "First-90-Days Thinking", description: "Has a realistic, prioritized view of how they would start." },
      { name: "Strategic Judgment", description: "Thinks beyond their task list about the team and product." },
      { name: "Mutual Fit", description: "Openly discusses hesitations, expectations, and offer logistics." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 40,
    questions: [
      { order: 0, text: "We're close to the end of the process. What are you looking for in your next role, and why this company specifically?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Imagine it's your first day. How would you spend your first 90 days — what would you prioritize, and what would 'doing well' look like?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Tell me about a decision in your last role you would have made differently than your team or company did. Why?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "What would make you decline an offer from us — is anything giving you hesitation right now?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Is there anything about the team, the role, or the company you'd still like to know?", type: "OPEN_ENDED", probeOnShort: false, isRequired: false },
    ],
  },
  {
    id: "leadership",
    title: "Leadership Interview",
    description: "Evaluate people leadership, strategic judgment, and organizational thinking for manager-and-above roles.",
    objective: "Assess how the candidate builds and scales teams, makes unpopular calls, develops senior talent, and aligns stakeholders.",
    icon: "Compass",
    aiTone: "PROFESSIONAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "People Leadership", description: "Builds trust, sets direction, and grows the people they manage." },
      { name: "Strategic Judgment", description: "Makes sound calls under ambiguity and communicates them clearly." },
      { name: "Team Building", description: "Hires, develops, and — when necessary — parts with people constructively." },
      { name: "Stakeholder Alignment", description: "Aligns conflicting parties around shared goals without authority alone." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 45,
    questions: [
      { order: 0, text: "Tell me about the largest team you've built or led. What was its mission, and what were the hardest growth pains?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Describe a decision you made that was unpopular with your team or peers. How did you decide, and how did you communicate it?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Tell me about a senior person who was underperforming. What did you do, and how did it end?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "Walk me through a time you had to align stakeholders with conflicting goals — say, product, sales, and engineering. What was your approach?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "How do you prefer to run your team's operating rhythm?", type: "SINGLE_CHOICE", options: [{ label: "Weekly 1-on-1s plus quarterly goals", value: "weekly_okr" }, { label: "Sprint-based ceremonies and standups", value: "sprints" }, { label: "Async-first, written updates", value: "async_written" }, { label: "Ad-hoc, driven by the work at hand", value: "adhoc" }], isRequired: true },
    ],
  },
  {
    id: "internship",
    title: "Internship / Entry-Level",
    description: "A friendly screen for early-career candidates: fundamentals, learning agility, and motivation over experience.",
    objective: "Identify high-potential candidates with strong fundamentals, curiosity, and drive, without expecting professional experience.",
    icon: "GraduationCap",
    aiTone: "FRIENDLY",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Learning Agility", description: "Picks up new skills quickly and can describe how they learn." },
      { name: "Fundamentals", description: "Solid grasp of core concepts from studies, projects, or self-teaching." },
      { name: "Initiative", description: "Builds, joins, or finishes things beyond what was required." },
      { name: "Motivation", description: "Clear, genuine reasons for this field and this internship." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 25,
    questions: [
      { order: 0, text: "Tell me about what you're studying (or recently studied) and what excites you most about this field.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Walk me through a project you're proud of — a class project, personal project, or club activity. What was your part and the outcome?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Tell me about a time you had to learn something new quickly — a tool, a language, a concept. How did you go about it?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "How familiar are you with our tech stack or industry?", type: "SINGLE_CHOICE", options: [{ label: "Used it in projects or coursework", value: "used" }, { label: "Studied it but haven't built with it", value: "studied" }, { label: "Heard of it, limited exposure", value: "heard" }, { label: "New to me", value: "new" }], isRequired: true },
      { order: 4, text: "What do you want to get out of this internship, and where do you see yourself after graduating?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "customer-discovery",
    title: "Customer Discovery",
    description: "Validate the problem before the product: real stories, current workarounds, and urgency — not feature wishes.",
    objective: "Understand the customer's problem from their lived experience: how often it happens, how they cope today, and whether solving it matters enough to pay for.",
    icon: "Lightbulb",
    aiTone: "CASUAL",
    followUpDepth: "DEEP",
    assessmentCriteria: [
      { name: "Problem Validation", description: "Describes concrete, recent instances of the problem — not hypotheticals." },
      { name: "Current Alternatives", description: "Clear about what they use or do today to cope, including workarounds." },
      { name: "Willingness to Pay", description: "Has spent money or significant effort on solving this before." },
      { name: "Specificity", description: "Answers are specific and detailed rather than polite generalities." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Think about the last time you ran into this problem. Walk me through exactly what happened — what were you trying to do, and what went wrong?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "How do you deal with this problem today? Show me the tools, spreadsheets, or workarounds you use.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Have you ever paid for something to solve this — a tool, a service, a hire? What happened?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "How much of a problem is this for you right now?", type: "SINGLE_CHOICE", options: [{ label: "It blocks me regularly", value: "blocking" }, { label: "Frequent annoyance, I work around it", value: "annoying" }, { label: "Occasional irritation", value: "occasional" }, { label: "Honestly, not a real problem", value: "not_a_problem" }], isRequired: true },
      { order: 4, text: "If a solution existed that worked exactly the way you want, what would make you actually switch to it?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "product-feedback",
    title: "Product Feedback",
    description: "Structured feedback from active or churned users: usage depth, friction points, and what to improve first.",
    objective: "Collect honest, specific feedback on how the product is used, where it frustrates, and what would increase retention and advocacy.",
    icon: "Star",
    aiTone: "CASUAL",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Usage Depth", description: "Reveals how the product actually fits into their routine, beyond feature lists." },
      { name: "Friction Points", description: "Pinpoints specific moments of frustration with concrete examples." },
      { name: "Value Drivers", description: "Articulates what they'd genuinely miss if the product disappeared." },
      { name: "Actionable Suggestions", description: "Offers improvements grounded in real usage, not wish lists." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 20,
    questions: [
      { order: 0, text: "How often do you use the product?", type: "SINGLE_CHOICE", options: [{ label: "Daily", value: "daily" }, { label: "A few times a week", value: "weekly" }, { label: "A few times a month", value: "monthly" }, { label: "Rarely or just trying it out", value: "rarely" }], isRequired: true },
      { order: 1, text: "What do you mainly use the product for, and what value does it give you in your day?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "Think of the last time the product frustrated you. What were you trying to do, and what happened?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 3, text: "If the product disappeared tomorrow, what's the one feature you'd miss most — and the one you'd miss least?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "If you could change one thing about the product, what would it be? Would you recommend it to a colleague — why or why not?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "sales-discovery",
    title: "Sales Discovery Call",
    description: "Qualify inbound leads the BANT way: needs, budget, decision process, and timeline — conversationally.",
    objective: "Qualify the prospect's need, budget, authority, and timeline while building rapport and uncovering what success looks like for them.",
    icon: "TrendingUp",
    aiTone: "PROFESSIONAL",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Need Identification", description: "The pain and its business impact are concrete and quantified." },
      { name: "Budget & Authority", description: "Budget range and the real decision-makers are on the table." },
      { name: "Timeline & Urgency", description: "A credible reason and date for buying now vs later." },
      { name: "Fit Qualification", description: "Use case, size, and expectations match what the product delivers." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Thanks for your interest. Tell me a bit about your team and the process or tools you're using today in this area.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "What made you start looking for a solution now — was there a specific trigger or event?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "What's your timeline for making a decision?", type: "SINGLE_CHOICE", options: [{ label: "Within a month", value: "this_month" }, { label: "This quarter", value: "this_quarter" }, { label: "Next 6 months", value: "six_months" }, { label: "Just exploring for now", value: "exploring" }], isRequired: true },
      { order: 3, text: "Who else is involved in this decision, and do you have a budget range in mind for solving this?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Six months after implementing a solution — what does success look like for you, concretely?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
    ],
  },
  {
    id: "exit-interview",
    title: "Exit Interview",
    description: "Offboarding conversation that surfaces honest reasons for leaving and actionable organizational feedback.",
    objective: "Understand why the employee is leaving, how they experienced their manager and team, and what the organization should change — while ending the relationship on good terms.",
    icon: "DoorOpen",
    aiTone: "FRIENDLY",
    followUpDepth: "MODERATE",
    assessmentCriteria: [
      { name: "Departure Reasons", description: "The real, prioritized reasons for leaving — not just the polite ones." },
      { name: "Manager & Team Experience", description: "Honest assessment of day-to-day support, feedback, and culture." },
      { name: "Retention Factors", description: "What could have kept them — compensation, growth, role, or management." },
      { name: "Actionable Feedback", description: "Concrete keep/start/stop suggestions the company can act on." },
    ],
    chatEnabled: true,
    voiceEnabled: true,
    videoEnabled: true,
    timeLimitMinutes: 30,
    questions: [
      { order: 0, text: "Congratulations on the next step. What's the primary reason you decided to leave, and were there other contributing factors?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 1, text: "Looking back, is there anything that could have changed your mind — in the role, the team, or the compensation?", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 2, text: "How supported did you feel by your manager during your time here?", type: "SINGLE_CHOICE", options: [{ label: "Very supported", value: "very_supported" }, { label: "Somewhat supported", value: "somewhat" }, { label: "Not really supported", value: "not_supported" }, { label: "Prefer not to say", value: "skip" }], isRequired: true },
      { order: 3, text: "What should the company keep doing, start doing, and stop doing? Be as candid as you like — this stays confidential.", type: "OPEN_ENDED", probeOnShort: true, isRequired: true },
      { order: 4, text: "Would you recommend working here to a friend, and would you consider coming back in the future? Anything else you'd like to add?", type: "OPEN_ENDED", probeOnShort: false, isRequired: false },
    ],
  },

  // ── Psychometric presets (deterministic ASSESSMENT sessions) ──────
  psychometricTemplate(
    "BIG_FIVE",
    "psychometric-big-five",
    "Psikotes: Big Five Personality",
    "30 agreement-rated statements profiling Openness, Conscientiousness, Extraversion, Agreeableness, and Emotional Stability. Scored automatically — no AI, results final immediately.",
    "BrainCircuit",
    20,
  ),
  psychometricTemplate(
    "DISC",
    "psychometric-disc",
    "Psikotes: DISC Work Style",
    "24 statements approximating Dominance, Influence, Steadiness, and Conscientiousness. Rule-based scoring with screening bands — recruiter owns the final read.",
    "Compass",
    15,
  ),
  psychometricTemplate(
    "REASONING",
    "psychometric-reasoning",
    "Psikotes: Penalaran (Numerik · Logika · Verbal)",
    "15 keyed questions across numerical, logical, and verbal reasoning. Objective right/wrong scoring — results final immediately.",
    "TrendingUp",
    20,
  ),
];
