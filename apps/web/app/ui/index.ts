// Shared UI primitives: presentational React components consumed by
// apps/web. Every component takes props and renders — no data fetching, no
// SDK, no router. See shared.md Part B for the full spec.

export { Eyebrow, type EyebrowProps } from './Eyebrow';
export { Card, type CardProps, type CardHeaderProps } from './Card';
export { Pill, type PillProps } from './Pill';
export { StatusDot, type StatusDotProps, type Status } from './StatusDot';
export { Button, type ButtonProps } from './Button';
export { MetaStrip, type MetaStripProps, type MetaStripItem } from './MetaStrip';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { VideoStage, type VideoStageProps, type VideoStageState } from './VideoStage';
export { TranscriptList, type TranscriptListProps } from './TranscriptList';
export { StarStrip, type StarStripProps } from './StarStrip';
export { ScoreBadge, type ScoreBadgeProps } from './ScoreBadge';
