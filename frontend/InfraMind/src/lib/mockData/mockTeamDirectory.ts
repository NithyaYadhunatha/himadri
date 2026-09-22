// src/lib/mockData/mockTeamDirectory.ts
//
// Purely presentational station roster for the Team page's "Station
// Overview" section — hardcoded demo data, not backed by Membership/Clerk.
// Distinct from the real STATIONS/ROLES enums in src/lib/auth/constants.ts,
// which drive actual access control below it on the same page.

export interface MockTeamMember {
  id: string
  name: string
  email: string
  role: string
  isDepartmentAdmin?: boolean
  phone: string
  location: string
  joinedOn: string
}

export interface MockDepartment {
  id: string
  name: string
  description: string
  members: MockTeamMember[]
}

export const MOCK_TEAM_DIRECTORY: MockDepartment[] = [
  {
    id: 'maitri',
    name: 'Maitri Station',
    description: 'Schirmacher Oasis, Queen Maud Land — power, logistics, and geomagnetism science',
    members: [
      {
        id: 'mtr-1',
        name: 'Arjun Mehta',
        email: 'arjun.mehta@ncpor.gov.in',
        role: 'Station Leader',
        isDepartmentAdmin: true,
        phone: '+91 98765 43210',
        location: 'Maitri Station',
        joinedOn: '2025-11-14',
      },
      {
        id: 'mtr-2',
        name: 'Priya Nair',
        email: 'priya.nair@ncpor.gov.in',
        role: 'Engineer — Power & Utilities',
        phone: '+91 91234 56780',
        location: 'Maitri Station',
        joinedOn: '2025-11-14',
      },
      {
        id: 'mtr-3',
        name: 'Rohit Sharma',
        email: 'rohit.sharma@ncpor.gov.in',
        role: 'Engineer — Vehicles & Logistics',
        phone: '+91 90123 45678',
        location: 'Maitri Station',
        joinedOn: '2025-11-14',
      },
      {
        id: 'mtr-4',
        name: 'Sneha Iyer',
        email: 'sneha.iyer@ncpor.gov.in',
        role: 'Scientist — Geomagnetism',
        phone: '+91 99887 76655',
        location: 'Maitri Station',
        joinedOn: '2025-12-02',
      },
    ],
  },
  {
    id: 'bharati',
    name: 'Bharati Station',
    description: 'Larsemann Hills, East Antarctica — CHP, medical, and atmospheric science',
    members: [
      {
        id: 'bhr-1',
        name: 'Kavita Desai',
        email: 'kavita.desai@ncpor.gov.in',
        role: 'Station Leader',
        isDepartmentAdmin: true,
        phone: '+91 98123 45670',
        location: 'Bharati Station',
        joinedOn: '2025-11-20',
      },
      {
        id: 'bhr-2',
        name: 'Vikram Rao',
        email: 'vikram.rao@ncpor.gov.in',
        role: 'Engineer — CHP & HVAC',
        phone: '+91 97654 32109',
        location: 'Bharati Station',
        joinedOn: '2025-11-20',
      },
      {
        id: 'bhr-3',
        name: 'Ananya Krishnan',
        email: 'ananya.krishnan@ncpor.gov.in',
        role: 'Station Medical Officer',
        phone: '+91 96543 21098',
        location: 'Bharati Station',
        joinedOn: '2025-12-05',
      },
    ],
  },
]
