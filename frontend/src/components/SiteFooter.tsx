import type { HTMLAttributes } from 'react';
import { Link } from '@tanstack/react-router';
import { Row, Text, TextLink } from '@/components/ui';
import { BrandMark } from '@/components/BrandMark';

/**
 * The marketing pages' footer. The landing and about pages each drew their own
 * and had drifted — a different wordmark size, the brand line on one only, a
 * copyright with and without the name. `links` is what differs on purpose:
 * each page points at the other. Anything else (a class, a data attribute)
 * goes on the <footer>: the landing folds it into its last screen.
 */
export function SiteFooter({
  links,
  className = '',
  ...rest
}: { links: { to: '/' | '/about' | '/community'; label: string }[] } & HTMLAttributes<HTMLElement>) {
  return (
    <footer className={`site-footer ${className}`} {...rest}>
      <div className="band-inner site-footer-inner">
        <Row align="center" gap={3}>
          <BrandMark />
          <Text tone="ghost" size="xs" as="span" aria-hidden="true">·</Text>
          <Text size="xs" tone="faint" as="span">All you need is a topic</Text>
        </Row>
        <Row gap={6} align="center">
          {links.map(link => (
            <TextLink key={link.to} asChild size="xs"><Link to={link.to}>{link.label}</Link></TextLink>
          ))}
          <Text size="xs" tone="ghost" as="span">© {new Date().getFullYear()} Topical</Text>
        </Row>
      </div>
    </footer>
  );
}
