// Mock data for the student-facing NEXUS product explored during Mission 001.
// Kept in its own module so the dataset is easy to find and modify later
// (including when Mission 001 issues are eventually planted on top of it).

export type OpportunityLevel = "Beginner" | "Intermediate" | "Advanced";

export type Opportunity = {
  id: string;
  title: string;
  org: string;
  category: string;
  description: string;
  longDescription: string;
  skills: string[];
  duration: string;
  level: OpportunityLevel;
  // Optional override used by the detail page's duration readout when it
  // differs from the summary shown on the card (e.g. a phased commitment).
  // Falls back to `duration` when not set.
  durationDetail?: string;
  // Optional override for which category bucket this opportunity is
  // filtered under. Falls back to `category` when not set — normally the
  // two always match.
  filterCategory?: string;
};

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "op-food-bank-app",
    title: "Volunteer Scheduling Redesign",
    org: "Harvest Share Network",
    category: "Technology",
    description:
      "Help redesign the volunteer scheduling flow for a food bank network serving three counties.",
    longDescription:
      "Harvest Share Network coordinates weekly volunteer shifts across three county food banks using a spreadsheet that's grown hard to manage. You'll work with the volunteer coordinator to sketch a simpler sign-up flow, then help translate it into a lightweight working prototype.",
    skills: ["JavaScript", "UI Design", "Data Entry"],
    duration: "4 weeks · ~5 hrs/week",
    level: "Beginner",
  },
  {
    id: "op-river-cleanup",
    title: "Watershed Data Tracker",
    org: "Blue Line Watershed Alliance",
    category: "Environment",
    description:
      "Track water-quality samples from monthly cleanups and help turn them into a public dashboard.",
    longDescription:
      "Volunteers collect water-quality readings at monthly river cleanups, but the results currently live in paper logs. You'll help digitize past samples, set up a simple spreadsheet-based tracker, and sketch what a public-facing dashboard could look like.",
    skills: ["Data Analysis", "Field Work", "Spreadsheets"],
    duration: "6 weeks · ~4 hrs/week",
    level: "Beginner",
  },
  {
    id: "op-peer-tutoring",
    title: "Peer Tutoring Pilot Support",
    org: "Bridge Learning Collective",
    category: "Education",
    description:
      "Support a pilot peer-tutoring program matching high schoolers with near-peer mentors.",
    longDescription:
      "Bridge Learning Collective is piloting a near-peer tutoring model in two high schools. You'll help refine the intake process for matching tutors with students, sit in on a few sessions, and help summarize what's working for the program lead.",
    skills: ["Communication", "Curriculum Design"],
    duration: "8 weeks · ~3 hrs/week",
    // M001-P05: intentional planted issue — detail page shows a different,
    // unexplained duration than the card.
    durationDetail: "6 weeks · ~4 hrs/week",
    level: "Intermediate",
  },
  {
    id: "op-health-survey",
    title: "Community Health Access Survey",
    org: "Wellspring Community Clinic",
    category: "Health",
    description:
      "Interview residents about barriers to care and summarize findings for the clinic's outreach team.",
    longDescription:
      "Wellspring Community Clinic wants to understand why some residents delay routine care. You'll help conduct short structured interviews at community events, log responses, and pull together a short summary the outreach team can act on.",
    skills: ["Interviewing", "Data Entry", "Spanish (helpful)"],
    duration: "3 weeks · ~5 hrs/week",
    level: "Beginner",
  },
  {
    id: "op-storefront-redesign",
    title: "Small Business Storefront Refresh",
    org: "Maple & Main Merchants Guild",
    category: "Design",
    description:
      "Refresh signage and window displays for three local shops ahead of the fall market.",
    longDescription:
      "Three shops along Maple & Main want a cohesive, low-cost visual refresh before the fall market season. You'll spend the first three weeks designing new window signage and in-store displays with each owner, then the final two weeks helping with printing and installation ahead of the market.",
    skills: ["Graphic Design", "Canva", "Client Communication"],
    duration: "5 weeks · ~4 hrs/week",
    // M001-FP01: intentional false positive — this looks like a mismatch
    // with the card's duration, but 3 design weeks + 2 installation weeks
    // add up to the same 5 weeks; the longDescription spells out the split.
    durationDetail: "3 weeks design + 2 weeks installation",
    level: "Intermediate",
  },
  {
    id: "op-coding-club",
    title: "Youth Coding Club Curriculum",
    org: "CodeNext Afterschool",
    category: "Technology",
    description:
      "Help build a beginner-friendly curriculum for a middle-school afterschool coding club.",
    longDescription:
      "CodeNext runs a twice-weekly afterschool coding club for middle schoolers but has been improvising lesson plans week to week. You'll help put together a simple ten-week curriculum with small projects the kids can actually finish and feel proud of.",
    skills: ["Python", "Teaching", "Patience"],
    duration: "10 weeks · ~3 hrs/week",
    level: "Intermediate",
  },
  {
    id: "op-community-garden",
    title: "Community Garden Volunteer Coordination",
    org: "Elmwood Community Garden",
    category: "Community",
    description:
      "Coordinate weekend volunteer shifts and keep the plot rotation schedule up to date.",
    longDescription:
      "Elmwood Community Garden relies on volunteers to keep shared plots watered and weeded, but shift coverage has been inconsistent. You'll help organize a simple weekend sign-up rotation and keep the plot schedule current for the season.",
    skills: ["Organization", "Scheduling", "Outreach"],
    duration: "6 weeks · ~3 hrs/week",
    level: "Beginner",
    // M001-P02: intentional planted issue — filtering uses this category
    // instead of the displayed "Community" badge above, so this card stays
    // visible under the wrong filter.
    filterCategory: "Environment",
  },
  {
    id: "op-accessibility-audit",
    title: "Nonprofit Accessibility Audit",
    org: "Civic Tech Collective",
    category: "Technology",
    description:
      "Audit three nonprofit websites for accessibility issues and write up prioritized recommendations.",
    longDescription:
      "Civic Tech Collective supports small nonprofits that rarely have time to think about accessibility. You'll review three of their partner sites against basic accessibility guidelines, then write a short, prioritized list of fixes each nonprofit can realistically act on.",
    skills: ["Accessibility", "HTML/CSS", "Attention to Detail"],
    duration: "4 weeks · ~4 hrs/week",
    level: "Advanced",
  },
];
