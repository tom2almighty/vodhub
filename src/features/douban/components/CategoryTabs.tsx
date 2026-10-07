import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DoubanKind } from '@/lib/api/douban';

export const DOUBAN_KINDS = ['movie', 'tv', 'show'] as const;
export type DoubanType = DoubanKind;

const LABELS: Record<DoubanKind, string> = {
  movie: '电影',
  tv: '剧集',
  show: '综艺',
};

interface CategoryTabsProps {
  value: DoubanKind;
  onChange: (next: DoubanKind) => void;
}

export function CategoryTabs({ value, onChange }: CategoryTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as DoubanKind)}>
      <TabsList>
        {DOUBAN_KINDS.map((t) => (
          <TabsTrigger key={t} value={t}>
            {LABELS[t]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

interface SubcategoryChipsProps {
  options: string[];
  value: string;
  onChange: (next: string) => void;
}
export function SubcategoryChips({ options, value, onChange }: SubcategoryChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Badge
          key={opt}
          variant={opt === value ? 'default' : 'secondary'}
          // A real button: these were clickable spans, so they could not be
          // focused or activated from the keyboard.
          render={<button type="button" />}
          aria-pressed={opt === value}
          onClick={() => onChange(opt)}
          className="h-auto cursor-pointer px-3 py-1 text-xs font-medium transition-colors"
        >
          {opt}
        </Badge>
      ))}
    </div>
  );
}

export function useDoubanType() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawKind = searchParams.get('kind');
  const kind: DoubanKind = (DOUBAN_KINDS as readonly string[]).includes(rawKind ?? '')
    ? (rawKind as DoubanKind)
    : 'movie';
  const type = searchParams.get('type') || '';

  const setKind = (next: DoubanKind) => {
    setSearchParams({ kind: next }, { replace: true });
  };
  const setType = (next: string) => {
    setSearchParams({ kind, type: next }, { replace: true });
  };

  return { kind, setKind, type, setType };
}
