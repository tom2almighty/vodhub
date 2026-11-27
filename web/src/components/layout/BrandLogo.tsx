import { cn } from '@/lib/utils';

export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M12.5 9.8c0-.85.94-1.36 1.66-.9l9.2 5.9a1.07 1.07 0 0 1 0 1.8l-9.2 5.9c-.72.46-1.66-.05-1.66-.9V9.8Z"
        className="fill-primary-foreground"
      />
    </svg>
  );
}
