import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { PropsWithChildren } from "react";

export const colors = {
  ink: "#1c1917",
  muted: "#57534e",
  line: "#e7e5e4",
  surface: "#ffffff",
  background: "#fafaf9",
  green: "#047857",
  greenSoft: "#ecfdf5",
  amber: "#92400e",
  amberSoft: "#fffbeb",
  red: "#b91c1c",
  blueSoft: "#eff6ff",
  roseSoft: "#fff1f2",
  violetSoft: "#f5f3ff",
};

export function Page({ children }: PropsWithChildren) {
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    {children}
  </ScrollView>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: object }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Heading({ children }: PropsWithChildren) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, style }: PropsWithChildren<{ style?: object }>) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Button({
  label, onPress, variant = "primary", disabled = false, accessibilityLabel, expanded,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "link";
  disabled?: boolean;
  accessibilityLabel?: string;
  expanded?: boolean;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled, ...(expanded !== undefined ? { expanded } : {}) }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.button,
      variant === "primary" ? styles.primary : variant === "danger" ? styles.danger
        : variant === "link" ? styles.link : styles.secondary,
      disabled && styles.disabled,
      pressed && !disabled && styles.pressed,
    ]}
  >
    <View style={styles.buttonContent}>
      <Text style={[styles.buttonText, variant === "primary" || variant === "danger" ? styles.primaryText : null]}>{label}</Text>
      {expanded !== undefined && <View accessible={false} style={[
        styles.chevron,
        { transform: [{ rotate: expanded ? "225deg" : "45deg" }] },
        (variant === "primary" || variant === "danger") && { borderColor: "#fff" },
      ]} />}
    </View>
  </Pressable>;
}

export function ButtonRow({ children }: PropsWithChildren) {
  return <View style={styles.buttonRow}>{children}</View>;
}

export function TextField({
  label, value, onChangeText, placeholder, keyboardType = "default", autoCapitalize = "none", maxLength,
}: {
  label: string;
  value: string;
  onChangeText(value: string): void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
}) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      maxLength={maxLength}
      style={styles.input}
    />
  </View>;
}

export function ChoiceGroup<T extends string | number>({
  label, value, options, onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}) {
  return <View style={styles.field}>
    {label ? <Text style={styles.label}>{label}</Text> : null}
    <View style={styles.choiceWrap}>
      {options.map((option) => <Pressable
        key={String(option.value)}
        accessibilityRole="radio"
        accessibilityState={{ checked: value === option.value }}
        onPress={() => onChange(option.value)}
        style={[styles.choice, value === option.value && styles.choiceSelected]}
      >
        <Text style={[styles.choiceText, value === option.value && styles.choiceTextSelected]}>{option.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}

export function MultiChoiceGroup<T extends string | number>({
  label, selected, options, onToggle,
}: {
  label?: string;
  selected: readonly T[];
  options: { value: T; label: string }[];
  onToggle(value: T): void;
}) {
  return <View style={styles.field}>
    {label ? <Text style={styles.label}>{label}</Text> : null}
    <View style={styles.choiceWrap}>
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return <Pressable
          key={String(option.value)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          onPress={() => onToggle(option.value)}
          style={[styles.choice, checked && styles.choiceSelected]}
        >
          <Text style={[styles.choiceText, checked && styles.choiceTextSelected]}>{option.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

export function ModalSheet({
  visible, title, onClose, children, closeLabel = "Close",
}: PropsWithChildren<{ visible: boolean; title: string; onClose(): void; closeLabel?: string }>) {
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.modalScrim}>
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
          {children}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

export function Notice({ children, tone = "info" }: PropsWithChildren<{ tone?: "info" | "error" | "success" }>) {
  if (!children) return null;
  const toneStyle = tone === "error" ? styles.noticeError : tone === "success" ? styles.noticeSuccess : styles.noticeInfo;
  return <Text accessibilityRole={tone === "error" ? "alert" : "text"} style={[styles.notice, toneStyle]}>{children}</Text>;
}

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Spacer() {
  return <View style={styles.spacer} />;
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40, gap: 12, backgroundColor: colors.background },
  card: { padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.surface },
  heading: { color: colors.ink, fontSize: 24, fontWeight: "700" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  field: { gap: 6 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#d6d3d1", borderRadius: 10, paddingHorizontal: 12, color: colors.ink, backgroundColor: "#fff", fontSize: 16 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { minHeight: 42, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: "#fff" },
  choiceSelected: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  choiceText: { color: colors.ink, fontSize: 14 },
  choiceTextSelected: { color: colors.green, fontWeight: "700" },
  button: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center", alignItems: "center", borderRadius: 10, borderWidth: 1 },
  primary: { backgroundColor: colors.green, borderColor: colors.green },
  secondary: { backgroundColor: "#fff", borderColor: "#d6d3d1" },
  danger: { backgroundColor: "#b91c1c", borderColor: "#b91c1c" },
  link: { backgroundColor: "transparent", borderColor: "transparent", paddingHorizontal: 8 },
  buttonText: { color: colors.ink, fontSize: 14, fontWeight: "600", textAlign: "center" },
  buttonContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  chevron: { width: 8, height: 8, borderRightWidth: 2, borderBottomWidth: 2, borderColor: colors.ink },
  primaryText: { color: "#fff" },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.7 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modalScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0007" },
  sheet: { maxHeight: "92%", minHeight: "45%", borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.background, paddingTop: 10 },
  sheetHandle: { width: 42, height: 4, alignSelf: "center", marginBottom: 10, borderRadius: 2, backgroundColor: "#a8a29e" },
  sheetHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
  sheetTitle: { color: colors.ink, fontSize: 19, fontWeight: "700", flex: 1 },
  closeText: { color: colors.muted, fontSize: 32, paddingHorizontal: 8 },
  sheetContent: { padding: 16, paddingBottom: 32, gap: 12 },
  notice: { borderWidth: 1, padding: 12, borderRadius: 10, fontSize: 14, lineHeight: 20 },
  noticeInfo: { borderColor: "#fed7aa", color: colors.amber, backgroundColor: colors.amberSoft },
  noticeError: { borderColor: "#fecaca", color: colors.red, backgroundColor: "#fef2f2" },
  noticeSuccess: { borderColor: "#a7f3d0", color: colors.green, backgroundColor: colors.greenSoft },
  spacer: { height: 4 },
});
