import { Select } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";

export const appSelectClassNames = {
  root: "sk-select",
  wrapper: "sk-select__wrapper",
  input: "sk-select__input",
  section: "sk-select__section",
  dropdown: "sk-select-dropdown",
  options: "sk-select-dropdown__options",
  option: "sk-select-dropdown__option",
  label: "sk-field__label",
  description: "sk-field__description",
  error: "sk-field__error",
};

export function AppSelect({
  label,
  description,
  leftSection,
  data,
  value,
  onChange,
  placeholder = "Chọn…",
  disabled,
  nothingFoundMessage = "Không có lựa chọn",
  ...rest
}) {
  return (
    <Select
      label={label}
      description={description}
      data={data}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      allowDeselect={false}
      checkIconPosition="right"
      nothingFoundMessage={nothingFoundMessage}
      comboboxProps={{ withinPortal: true, position: "bottom-start", offset: 6 }}
      rightSection={<IconChevronDown size={16} stroke={1.75} className="sk-select__chevron" />}
      leftSection={leftSection}
      leftSectionWidth={leftSection ? 38 : undefined}
      rightSectionWidth={34}
      leftSectionPointerEvents="none"
      classNames={appSelectClassNames}
      {...rest}
    />
  );
}
