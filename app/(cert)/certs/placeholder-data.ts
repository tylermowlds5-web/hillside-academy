// ── PLACEHOLDER DATA — Step 3 look-and-feel review only ──────────────────
// Realistic dummy programs/modules so the cert area can be seen and approved
// before real content or logic is wired in. Nothing here touches the
// database; a later step replaces this file with queries against
// cert_programs / cert_requirements / cert_awards.

export type PlaceholderModuleState = 'completed' | 'current' | 'locked'

export type PlaceholderModule = {
  id: string
  title: string
  kind: 'video' | 'quiz' | 'exam'
  minutes: number
  state: PlaceholderModuleState
  blurb: string
}

export type PlaceholderProgram = {
  id: string
  name: string
  tagline: string
  description: string
  required: boolean
  validityMonths: number | null
  status: 'not_started' | 'in_progress' | 'certified'
  earnedAt?: string
  expiresAt?: string
  modules: PlaceholderModule[]
}

export const PLACEHOLDER_PROGRAMS: PlaceholderProgram[] = [
  {
    id: 'irrigation-tech-1',
    name: 'Irrigation Technician — Level 1',
    tagline: 'Install, program, and troubleshoot residential irrigation systems.',
    description:
      'Covers the full Hillside irrigation service standard: system components, controller programming, drip zones, leak troubleshooting, and seasonal startup/winterization. Finish all modules and pass the certification exam to earn your Level 1 credential.',
    required: true,
    validityMonths: 24,
    status: 'in_progress',
    modules: [
      {
        id: 'system-components',
        title: 'Irrigation System Components',
        kind: 'video',
        minutes: 22,
        state: 'completed',
        blurb: 'Valves, heads, backflow preventers, and mainline vs. lateral lines.',
      },
      {
        id: 'controllers',
        title: 'Controllers & Programming',
        kind: 'video',
        minutes: 28,
        state: 'completed',
        blurb: 'Setting schedules, seasonal adjust, and rain sensor wiring on the controllers we service.',
      },
      {
        id: 'drip-systems',
        title: 'Drip Systems & Emitters',
        kind: 'video',
        minutes: 25,
        state: 'current',
        blurb: 'Emitter selection, filter/regulator assemblies, and flushing a drip zone the right way.',
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting Leaks & Breaks',
        kind: 'video',
        minutes: 31,
        state: 'locked',
        blurb: 'Finding stuck valves, chasing wire faults, and repairing lateral breaks in the field.',
      },
      {
        id: 'seasonal',
        title: 'Seasonal Startup & Winterization',
        kind: 'video',
        minutes: 19,
        state: 'locked',
        blurb: 'Spring pressurization checklist and blow-out procedure for winter shutdown.',
      },
      {
        id: 'final-exam',
        title: 'Level 1 Certification Exam',
        kind: 'exam',
        minutes: 30,
        state: 'locked',
        blurb: '25 questions covering every module. 80% required to earn the credential.',
      },
    ],
  },
  {
    id: 'equipment-safety',
    name: 'Equipment & Tool Safety',
    tagline: 'Safe operation of mowers, trimmers, blowers, and hand tools.',
    description:
      'The Hillside safety standard for every piece of powered equipment on the trailer. Required for all field crew members before solo equipment operation.',
    required: true,
    validityMonths: 12,
    status: 'certified',
    earnedAt: 'March 14, 2026',
    expiresAt: 'March 14, 2027',
    modules: [
      { id: 'ppe', title: 'PPE & Pre-Operation Checks', kind: 'video', minutes: 15, state: 'completed', blurb: '' },
      { id: 'mowers', title: 'Mower Operation & Slopes', kind: 'video', minutes: 24, state: 'completed', blurb: '' },
      { id: 'handhelds', title: 'Trimmers, Edgers & Blowers', kind: 'video', minutes: 18, state: 'completed', blurb: '' },
      { id: 'fueling', title: 'Fueling, Transport & Storage', kind: 'video', minutes: 12, state: 'completed', blurb: '' },
      { id: 'safety-exam', title: 'Safety Certification Exam', kind: 'exam', minutes: 20, state: 'completed', blurb: '' },
    ],
  },
  {
    id: 'plant-care-fundamentals',
    name: 'Plant Care Fundamentals',
    tagline: 'Pruning, watering, fertilization, and plant health basics.',
    description:
      'Foundation credential for maintenance crews: correct pruning cuts by season, watering diagnostics, fertilization schedules, and spotting common pests and disease before the client does.',
    required: false,
    validityMonths: null,
    status: 'not_started',
    modules: [
      { id: 'pruning', title: 'Pruning Cuts & Timing', kind: 'video', minutes: 26, state: 'current', blurb: '' },
      { id: 'watering', title: 'Watering & Soil Diagnostics', kind: 'video', minutes: 21, state: 'locked', blurb: '' },
      { id: 'fertilization', title: 'Fertilization Programs', kind: 'video', minutes: 17, state: 'locked', blurb: '' },
      { id: 'pests', title: 'Pest & Disease Identification', kind: 'video', minutes: 29, state: 'locked', blurb: '' },
      { id: 'turf', title: 'Turf Health Essentials', kind: 'video', minutes: 23, state: 'locked', blurb: '' },
      { id: 'plant-quiz', title: 'Module Knowledge Checks', kind: 'quiz', minutes: 15, state: 'locked', blurb: '' },
      { id: 'plant-exam', title: 'Fundamentals Certification Exam', kind: 'exam', minutes: 30, state: 'locked', blurb: '' },
    ],
  },
  {
    id: 'crew-leadership',
    name: 'Crew Leadership Essentials',
    tagline: 'Running a route: job walks, client communication, and crew coaching.',
    description:
      'For crew members stepping up to lead: planning the day, quality walks, handling client conversations on site, and coaching newer teammates to the Hillside standard.',
    required: false,
    validityMonths: null,
    status: 'not_started',
    modules: [
      { id: 'route-planning', title: 'Route Planning & the Job Walk', kind: 'video', minutes: 24, state: 'current', blurb: '' },
      { id: 'client-comms', title: 'On-Site Client Communication', kind: 'video', minutes: 20, state: 'locked', blurb: '' },
      { id: 'quality', title: 'Quality Standards & Final Walks', kind: 'video', minutes: 18, state: 'locked', blurb: '' },
      { id: 'coaching', title: 'Coaching Your Crew', kind: 'video', minutes: 22, state: 'locked', blurb: '' },
      { id: 'incidents', title: 'Incidents, Damage & Escalation', kind: 'video', minutes: 16, state: 'locked', blurb: '' },
      { id: 'docs', title: 'Paperwork & End-of-Day Reporting', kind: 'video', minutes: 14, state: 'locked', blurb: '' },
      { id: 'scenarios', title: 'Leadership Scenario Quizzes', kind: 'quiz', minutes: 20, state: 'locked', blurb: '' },
      { id: 'lead-exam', title: 'Leadership Certification Exam', kind: 'exam', minutes: 35, state: 'locked', blurb: '' },
    ],
  },
]

export function placeholderProgram(id: string): PlaceholderProgram | undefined {
  return PLACEHOLDER_PROGRAMS.find((p) => p.id === id)
}

export function programProgress(p: PlaceholderProgram) {
  const completed = p.modules.filter((m) => m.state === 'completed').length
  const currentIdx = p.modules.findIndex((m) => m.state === 'current')
  return {
    total: p.modules.length,
    completed,
    current: currentIdx === -1 ? undefined : currentIdx + 1,
  }
}

export function totalMinutes(p: PlaceholderProgram) {
  return p.modules.reduce((sum, m) => sum + m.minutes, 0)
}
