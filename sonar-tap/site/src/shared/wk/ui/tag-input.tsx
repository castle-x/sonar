/**
 * Tag Input 组件
 * 标签输入组件，支持回车/逗号添加、点击删除、Backspace删除、粘贴批量添加
 */

import { XIcon } from "lucide-react";
import { useState, type KeyboardEvent, type ClipboardEvent, useRef } from "react";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/shadcn/badge";

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maxTags?: number;
}

export function TagInput({
  value = [],
  onChange,
  placeholder = "输入后按回车或逗号添加",
  className,
  disabled = false,
  maxTags,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t || value.includes(t)) return;
    if (maxTags && value.length >= maxTags) return;
    onChange([...value, t]);
    setInputValue("");
  };

  const addTags = (tags: string[]) => {
    const newTags = tags.map((t) => t.trim()).filter((t) => t && !value.includes(t));
    if (!newTags.length) return;
    const next = maxTags ? newTags.slice(0, maxTags - value.length) : newTags;
    onChange([...value, ...next]);
    setInputValue("");
  };

  const removeTag = (index: number) => onChange(value.filter((_, i) => i !== index));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      if (inputValue) addTag(inputValue);
      return;
    }
    if (e.key === "Backspace" && !inputValue && value.length > 0) {
      e.preventDefault();
      removeTag(value.length - 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes(",")) {
      e.preventDefault();
      addTags(text.split(","));
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tag list
        <Badge key={i} variant="secondary" className="gap-1 pe-1 ps-2 h-6">
          <span className="text-xs">{tag}</span>
          {!disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
              className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={disabled || (maxTags !== undefined && value.length >= maxTags)}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed text-sm"
      />
    </div>
  );
}
