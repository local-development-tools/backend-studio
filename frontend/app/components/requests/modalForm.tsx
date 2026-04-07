import {useState} from "react";
import {Input} from "../ui/input";
import {Button} from "../ui/button";

interface ModalFormProps {
  title: string;
  fields: InputField[];
  onSubmit: (values: Record<string, string | File>) => void; // changed
  onClose: () => void;
  submitLabel?: string;
}

export interface InputField {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  defaultValue?: string;
  options?: string[];
  required?: boolean;
  accept?: string; // added
}

export const ModalForm = ({
  title,
  fields,
  onSubmit,
  onClose,
  submitLabel = "Submit",
}: ModalFormProps) => {
  const initialValues = fields.reduce(
    (acc, f) => {
      acc[f.name] = f.defaultValue || "";
      return acc;
    },
    {} as Record<string, string | File>, // changed
  );

  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (name: string, value: string | File) => { // changed
    setValues((prev) => ({...prev, [name]: value}));
    setErrors((prev) => ({...prev, [name]: ""}));
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};

    fields.forEach((field) => {
      const value = values[field.name];
      if (
        field.required &&
        (!value || (typeof value === "string" && !value.trim()))
      ) {
        newErrors[field.name] = `${field.label} is required`;
      }
    });

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    onSubmit(values);
    onClose();
  };

  const isValid = fields.every((f) => {
    const value = values[f.name];
    return !f.required || (value && (typeof value !== "string" || value.trim()));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background p-4 rounded-md w-80 space-y-4 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>

        {fields.map((field) => (
          <div key={field.name} className="flex flex-col space-y-1">
            <label className="text-xs font-medium">
              {field.label}
              {field.required && (
                <span className="text-red-500"> *</span>
              )}
            </label>

            {field.type === "select" && field.options ? (
              <select
                value={values[field.name] as string}
                onChange={(e) =>
                  handleChange(field.name, e.target.value)
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-background text-foreground"
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.type === "file" ? ( // added
              <Input
                type="file"
                accept={field.accept || ".zip"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleChange(field.name, file);
                }}
              />
            ) : (
              <Input
                type={field.type || "text"}
                placeholder={field.placeholder}
                value={values[field.name] as string}
                onChange={(e) =>
                  handleChange(field.name, e.target.value)
                }
              />
            )}

            {errors[field.name] && (
              <span className="text-xs text-red-500">
                {errors[field.name]}
              </span>
            )}
          </div>
        ))}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};