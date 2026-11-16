import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type SectionMetric = {
  label: string;
  value: string;
  helper?: string;
};

type SectionItem = {
  title: string;
  detail: string;
};

type SectionAction = {
  label: string;
  href: string;
};

type WorkspaceSectionPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  primaryAction: SectionAction;
  secondaryAction: SectionAction;
  metrics: SectionMetric[];
  highlights: SectionItem[] | ReactNode;
  nextSteps: SectionItem[] | ReactNode;
};

export function WorkspaceSectionPage({
  eyebrow,
  title,
  description,
  icon: Icon,
  primaryAction,
  secondaryAction,
  metrics,
  highlights,
  nextSteps,
}: WorkspaceSectionPageProps) {
  return (
    <div className="neo-section-page flex flex-1 flex-col gap-6">
      <section className="premium-card rounded-[24px] px-6 py-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 text-label-sm text-on-surface-variant">
              <Icon size={14} />
              {eyebrow}
            </div>
            <div className="space-y-2">
              <h1 className="text-display-lg-mobile text-on-surface lg:text-display-lg">
                {title}
              </h1>
              <p className="max-w-xl text-body-md text-on-surface-variant">
                {description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={secondaryAction.href}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-low px-4 text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {secondaryAction.label}
            </Link>
            <Link
              href={primaryAction.href}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-body-sm font-medium text-on-primary shadow-lg shadow-primary/10 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {primaryAction.label}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="premium-card interactive-card rounded-[20px] p-5"
          >
            <p className="text-label-sm text-on-surface-variant">{metric.label}</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <p className="text-display-lg-mobile text-on-surface">{metric.value}</p>
              <p className="pb-2 text-body-sm text-secondary">{metric.helper}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid flex-1 gap-6 lg:grid-cols-[1.25fr_0.95fr]">
        <div className="premium-card rounded-[24px] p-6">
          <p className="text-label-sm text-on-surface-variant">Highlights</p>
          <h2 className="mt-1 text-headline-md text-on-surface">
            What is active right now
          </h2>

          <div className="mt-6 space-y-4">
            {Array.isArray(highlights) ? highlights.map((item) => (
              <div
                key={item.title}
                className="interactive-card rounded-2xl border border-outline-variant bg-surface-container-low p-4"
              >
                <p className="text-body-md font-medium text-on-surface">
                  {item.title}
                </p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  {item.detail}
                </p>
              </div>
            )) : highlights}
          </div>
        </div>

        <div className="premium-card rounded-[24px] p-6">
          <p className="text-label-sm text-on-surface-variant">Next steps</p>
          <h2 className="mt-1 text-headline-md text-on-surface">
            Continue the workflow
          </h2>

          <div className="mt-6 space-y-3">
            {Array.isArray(nextSteps) ? nextSteps.map((item) => (
              <div
                key={item.title}
                className="interactive-card rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3"
              >
                <p className="text-body-md font-medium text-on-surface">
                  {item.title}
                </p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  {item.detail}
                </p>
              </div>
            )) : nextSteps}
          </div>
        </div>
      </section>
    </div>
  );
}
