import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import type { ChangeHandler } from "react-hook-form";
import { Dropdown, type DropdownProps } from "@/components/dropdown";

type SelectFieldProps = Omit<DropdownProps, "options" | "onChange"> & {
  children: ReactNode;
  onChange?: ChangeHandler;
  onValueChange?: (value: string) => void;
  highlightedValue?: string;
};

export function SelectField({ children, onChange, onValueChange, highlightedValue, ...props }: SelectFieldProps) {
  const options = Children.toArray(children).filter(isValidElement<ComponentProps<"option">>).map((option) => ({
    value: String(option.props.value ?? ""),
    label: option.props.children,
    text: Children.toArray(option.props.children).join(""),
    highlighted: String(option.props.value) === highlightedValue,
  }));
  return <Dropdown {...props} options={options} onChange={(value) => {
    if (onChange) void onChange({ target: { name: props.name, value }, type: "change" });
    onValueChange?.(value);
  }} />;
}
