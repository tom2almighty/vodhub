import { Search as SearchIcon, X } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (value: string) => void;
  /** Optional control rendered beside the input, e.g. the source filter. */
  action?: ReactNode;
}

export function SearchBar({ value, onChange, onSubmit, action }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="mb-8">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
          />
          <Input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="搜索电影、剧集、综艺..."
            aria-label="搜索电影、剧集、综艺"
            autoComplete="off"
            autoFocus
            className="h-12 pl-10 pr-12 text-sm"
          />
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                onChange('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
              aria-label="清空"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          )}
        </div>
        {action}
      </div>
    </form>
  );
}
