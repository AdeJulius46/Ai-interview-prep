// Shared UI primitives: presentational React components consumed by
// apps/web. Every component takes props and renders — no data fetching, no
// SDK, no router. See shared.md Part B for the full spec.

export { Eyebrow, type EyebrowProps } from './Eyebrow.js';
export { Card, type CardProps, type CardHeaderProps } from './Card.js';
export { Pill, type PillProps } from './Pill.js';
export { StatusDot, type StatusDotProps, type Status } from './StatusDot.js';
export { Button, type ButtonProps } from './Button.js';
export { MetaStrip, type MetaStripProps, type MetaStripItem } from './MetaStrip.js';
export { EmptyState, type EmptyStateProps } from './EmptyState.js';
export { VideoStage, type VideoStageProps, type VideoStageState } from './VideoStage.js';
export { TranscriptList, type TranscriptListProps } from './TranscriptList.js';
export { StarStrip, type StarStripProps } from './StarStrip.js';
export { ScoreBadge, type ScoreBadgeProps } from './ScoreBadge.js';
