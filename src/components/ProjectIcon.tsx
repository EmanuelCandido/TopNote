import { BookOpen, BriefcaseBusiness, Code2, Folder, GraduationCap, HeartPulse, Lightbulb, Palette, Rocket, Stethoscope, Wrench, type LucideIcon } from 'lucide-react'

export const projectIconChoices: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'folder', label: 'Pasta', icon: Folder },
  { id: 'stethoscope', label: 'Saúde', icon: Stethoscope },
  { id: 'code', label: 'Código', icon: Code2 },
  { id: 'graduation', label: 'Faculdade', icon: GraduationCap },
  { id: 'briefcase', label: 'Trabalho', icon: BriefcaseBusiness },
  { id: 'book', label: 'Leitura', icon: BookOpen },
  { id: 'idea', label: 'Ideias', icon: Lightbulb },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'rocket', label: 'Lançamento', icon: Rocket },
  { id: 'health', label: 'Bem-estar', icon: HeartPulse },
  { id: 'tools', label: 'Ferramentas', icon: Wrench },
]

export function ProjectIcon({ name, size = 20, color, className }: { name: string; size?: number; color?: string; className?: string }) {
  const Icon = projectIconChoices.find(choice => choice.id === name)?.icon ?? Folder
  return <Icon className={className} size={size} color={color} strokeWidth={1.9}/>
}
