import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One titled section of a page, laid out the same way everywhere. */
export function SectionCard({
  action,
  children,
  description,
  id,
  title,
  className,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  description?: React.ReactNode;
  id?: string;
  title: React.ReactNode;
  className?: string;
}) {
  return (
    <Card id={id} className={cn("scroll-mt-4 shadow-surface", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
