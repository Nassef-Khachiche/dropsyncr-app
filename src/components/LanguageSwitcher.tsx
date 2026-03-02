import { Languages } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useLanguage, type LanguageCode } from '../contexts/LanguageContext';

const languageOptions: Array<{ value: LanguageCode; label: string }> = [
  { value: 'en', label: 'EN' },
  { value: 'nl', label: 'NL' },
  { value: 'de', label: 'DE' },
];

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      <Languages className="w-4 h-4 text-slate-500" />
      <Select value={language} onValueChange={(value: LanguageCode) => setLanguage(value)}>
        <SelectTrigger className="w-[88px] border-slate-200 shadow-sm bg-white">
          <SelectValue placeholder="EN" />
        </SelectTrigger>
        <SelectContent align="end" className="border-slate-200 shadow-lg">
          {languageOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
