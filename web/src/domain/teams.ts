// The 20 finalists in showcase order, from "AWS CendekiAwan 2.0 - Finalist Showcase Order.xlsx".
// The operator import (later) replaces this seed.

export type CategoryId = 'education' | 'health' | 'environment' | 'finance' | 'govtech'

export interface Category {
  id: CategoryId
  group: number
  name: string
}

export interface Team {
  id: string
  order: number
  category: CategoryId
  university: 'APU' | 'MMU' | 'Nilai' | 'UM'
  teamName: string
  appName: string
}

export const CATEGORIES: Category[] = [
  { id: 'education', group: 1, name: 'Smart Education' },
  { id: 'health', group: 2, name: 'Digital Health' },
  { id: 'environment', group: 3, name: 'Sustainable Environment & Climate' },
  { id: 'finance', group: 4, name: 'Financial Inclusion & SME Empowerment' },
  { id: 'govtech', group: 5, name: 'GovTech & Social Impact' },
]

const row = (
  order: number,
  category: CategoryId,
  university: Team['university'],
  teamName: string,
  appName: string,
): Team => ({ id: `t${String(order).padStart(2, '0')}`, order, category, university, teamName, appName })

export const TEAMS: Team[] = [
  row(1, 'education', 'MMU', 'Virtual Science Lab Assistant', 'Virtual Science Lab Assistant'),
  row(2, 'education', 'Nilai', 'Learning Steps for Autistic Kids', 'Learning Steps for Autistic Kids'),
  row(3, 'education', 'APU', 'EC 1+1', 'LangHub'),
  row(4, 'education', 'UM', 'ByteCloud', 'StudySnap'),
  row(5, 'health', 'APU', 'Mediguard', 'MediGuard'),
  row(6, 'health', 'MMU', 'Diabetes Control AI Expert', 'Diabetes Control AI Expert'),
  row(7, 'health', 'UM', 'UM IS ONE', 'SmartMed Cycle'),
  row(8, 'health', 'Nilai', 'MindSparks', 'UbatJelas'),
  row(9, 'environment', 'UM', 'Wo Dou Bu Zhi Dao', 'EcoLens'),
  row(10, 'environment', 'Nilai', 'Agroshield AI Diagnostic Tool', 'AgroShield AI'),
  row(11, 'environment', 'MMU', 'Smart Waste', 'Smart Waste'),
  row(12, 'environment', 'APU', 'Whoopie', 'See You CO2'),
  row(13, 'finance', 'Nilai', 'FinBot', 'AI Personal Finance Advisor'),
  row(14, 'finance', 'UM', 'BuNengShuDeLiYou', 'SME DEALGUARD MY'),
  row(15, 'finance', 'APU', 'Internelligence', 'SMEwise'),
  row(16, 'finance', 'MMU', 'Malaysia Business Launchpad', 'Malaysia Business Launchpad'),
  row(17, 'govtech', 'Nilai', 'Food And Stay Hub', 'Food And Stay Hub'),
  row(18, 'govtech', 'APU', 'Viltrum', 'City Mind MY'),
  row(19, 'govtech', 'UM', 'Teh Tarik Overflow', 'OpsJejak'),
  row(20, 'govtech', 'MMU', 'Dewan AI', 'Dewan AI'),
]

export const categoryOf = (id: CategoryId): Category => CATEGORIES.find((c) => c.id === id)!
export const teamsIn = (category: CategoryId): Team[] => TEAMS.filter((t) => t.category === category)
