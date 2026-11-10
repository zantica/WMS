// apps/mobile/src/components/WmsUiPrimitives.tsx
// Primitivas reutilizables de interfaz móvil (@wms/mobile) alineadas con el HUD industrial
// S5 dark-data-dense de la Torre de Control Web (@wms/web).
// Regla estricta: cero hex crudos; todos los colores provienen de WMS_COLORS / resolveToneColors.

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_MIN_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  monoText,
  resolveToneColors,
  tabularNums,
  type WmsTone,
} from "../theme/tokens";

export interface WmsTagProps {
  label: string;
  symbol?: string | undefined;
  tone?: WmsTone | undefined;
  mono?: boolean | undefined;
  testID?: string | undefined;
}

export function WmsTag({
  label,
  symbol,
  tone = "slate",
  mono = true,
  testID,
}: WmsTagProps): JSX.Element {
  const toneColors = resolveToneColors(tone);

  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: toneColors.bg,
          borderColor: toneColors.border,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      <Text
        style={[
          styles.tagText,
          mono ? monoText : null,
          { color: toneColors.text },
        ]}
      >
        {symbol ? `${symbol} ${label}` : label}
      </Text>
    </View>
  );
}

export interface WmsKpiCardProps {
  label: string;
  value: string | number;
  unit?: string | undefined;
  footnote?: string | undefined;
  tone?: WmsTone | undefined;
  tagLabel?: string | undefined;
  testID?: string | undefined;
}

export function WmsKpiCard({
  label,
  value,
  unit,
  footnote,
  tone = "blue",
  tagLabel,
  testID,
}: WmsKpiCardProps): JSX.Element {
  const toneColors = resolveToneColors(tone);

  return (
    <View style={styles.kpiCard} {...(testID ? { testID } : {})}>
      <View
        style={[styles.kpiTopGlow, { backgroundColor: toneColors.text }]}
      />
      <View style={styles.kpiHeader}>
        <Text style={styles.kpiLabel}>{label}</Text>
        {tagLabel ? <WmsTag label={tagLabel} tone={tone} /> : null}
      </View>
      <Text style={[styles.kpiValue, monoText, { color: toneColors.text }]}>
        {value}
        {unit ? <Text style={styles.kpiUnit}> {unit}</Text> : null}
      </Text>
      {footnote ? <Text style={styles.kpiFootnote}>{footnote}</Text> : null}
    </View>
  );
}

export interface WmsBannerProps {
  title?: string | undefined;
  message: string;
  codeBadge?: string | undefined;
  actionHint?: string | undefined;
  tone?: WmsTone | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  children?: ReactNode;
  testID?: string | undefined;
}

export function WmsBanner({
  title,
  message,
  codeBadge,
  actionHint,
  tone = "blue",
  actionLabel,
  onAction,
  children,
  testID,
}: WmsBannerProps): JSX.Element {
  const toneColors = resolveToneColors(tone);

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: toneColors.bg,
          borderColor: toneColors.border,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      {title || codeBadge ? (
        <View style={styles.bannerHeader}>
          {title ? (
            <Text style={[styles.bannerTitle, { color: toneColors.text }]}>
              {title}
            </Text>
          ) : null}
          {codeBadge ? (
            <WmsTag label={codeBadge} tone={tone} mono />
          ) : null}
        </View>
      ) : null}

      <Text style={styles.bannerMessage}>{message}</Text>

      {actionHint ? (
        <Text style={[styles.bannerHint, { color: toneColors.text }]}>
          {actionHint}
        </Text>
      ) : null}

      {children}

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={[
            styles.bannerActionBtn,
            {
              backgroundColor: toneColors.text,
            },
          ]}
        >
          <Text style={styles.bannerActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface WmsEmptyStateProps {
  title: string;
  subtitle: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  testID?: string | undefined;
}

export function WmsEmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
}: WmsEmptyStateProps): JSX.Element {
  return (
    <View style={styles.emptyCard} {...(testID ? { testID } : {})}>
      <WmsTag label="SIN REGISTROS" symbol="○" tone="slate" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.emptyActionBtn}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface WmsProgressBarProps {
  percent: number;
  leftLabel?: string | undefined;
  rightLabel?: string | undefined;
  tone?: WmsTone | undefined;
  testID?: string | undefined;
}

export function WmsProgressBar({
  percent,
  leftLabel,
  rightLabel,
  tone = "blue",
  testID,
}: WmsProgressBarProps): JSX.Element {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  const toneColors = resolveToneColors(tone);

  return (
    <View style={styles.progressContainer} {...(testID ? { testID } : {})}>
      {leftLabel || rightLabel ? (
        <View style={styles.progressLabelsRow}>
          <Text style={[styles.progressLabel, tabularNums]}>
            {leftLabel ?? ""}
          </Text>
          <Text style={[styles.progressLabel, monoText]}>
            {rightLabel ?? `${safePercent}%`}
          </Text>
        </View>
      ) : null}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${safePercent}%`,
              backgroundColor: toneColors.text,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: WMS_SPACING.sm,
    paddingVertical: 3,
    borderRadius: WMS_RADII.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  tagText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    padding: WMS_SPACING.md,
    gap: WMS_SPACING.xs,
    overflow: "hidden",
    position: "relative",
  },
  kpiTopGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  kpiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: WMS_SPACING.xs,
  },
  kpiLabel: {
    color: WMS_COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: WMS_FONT_SIZES.xl,
    fontWeight: "800",
    color: WMS_COLORS.text,
  },
  kpiUnit: {
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "600",
    color: WMS_COLORS.muted,
  },
  kpiFootnote: {
    color: WMS_COLORS.muted,
    fontSize: 11,
  },
  banner: {
    borderRadius: WMS_RADII.lg,
    borderWidth: 1,
    padding: WMS_SPACING.md,
    gap: WMS_SPACING.xs,
  },
  bannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: WMS_SPACING.sm,
    flexWrap: "wrap",
  },
  bannerTitle: {
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "800",
    flex: 1,
  },
  bannerMessage: {
    color: WMS_COLORS.text,
    fontSize: 13,
    lineHeight: 18,
  },
  bannerHint: {
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "600",
  },
  bannerActionBtn: {
    marginTop: WMS_SPACING.xs,
    minHeight: 38,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    borderRadius: WMS_RADII.md,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  bannerActionText: {
    color: WMS_COLORS.accentContrast,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "800",
  },
  emptyCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.xl,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  emptyTitle: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.base,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    color: WMS_COLORS.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  emptyActionBtn: {
    marginTop: WMS_SPACING.xs,
    minHeight: WMS_MIN_TOUCH_TARGET,
    paddingHorizontal: WMS_SPACING.lg,
    paddingVertical: WMS_SPACING.sm,
    borderRadius: WMS_RADII.md,
    backgroundColor: WMS_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyActionText: {
    color: WMS_COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  progressContainer: {
    gap: 6,
  },
  progressLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  progressLabel: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "600",
  },
  progressTrack: {
    height: 8,
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.sm,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
});
