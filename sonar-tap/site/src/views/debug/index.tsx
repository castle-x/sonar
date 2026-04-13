import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TestTube01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDebugRegex } from "@/shared/hooks/use-tap-api";
import type { RegexDebugResp } from "@/shared/hooks/use-tap-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/shadcn/card";
import { Input } from "@/shared/shadcn/input";
import { Label } from "@/shared/shadcn/label";
import { Textarea } from "@/shared/shadcn/textarea";
import { Button } from "@/shared/shadcn/button";
import { Badge } from "@/shared/shadcn/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/shadcn/select";

function DebugPage() {
  const { t } = useTranslation("dashboard");
  const [tool, setTool] = useState("regex");
  const [pattern, setPattern] = useState("");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<RegexDebugResp | null>(null);

  const regexMutation = useDebugRegex();

  const handleTest = () => {
    if (tool === "regex") {
      regexMutation.mutate(
        { pattern, input },
        { onSuccess: (data) => setResult(data) }
      );
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      {/* Input panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={TestTube01Icon} size={18} />
              {t("pages.debug.inputPanel")}
            </CardTitle>
            <Select value={tool} onValueChange={setTool}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="regex">{t("pages.debug.tools.regex")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tool === "regex" && (
            <>
              <div className="space-y-2">
                <Label>{t("pages.debug.regex.pattern")}</Label>
                <Input
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="e.g. --id=(\w+)"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.debug.regex.input")}</Label>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. --config test --id=server001 -LOG=/tmp/app.log"
                  className="font-mono min-h-20"
                />
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button
              onClick={handleTest}
              disabled={regexMutation.isPending || !pattern}
            >
              {t("pages.debug.run")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Result panel */}
      <Card>
        <CardHeader>
          <CardTitle>{t("pages.debug.resultPanel")}</CardTitle>
        </CardHeader>
        <CardContent>
          {result === null ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t("pages.debug.noResult")}
            </p>
          ) : (
            <div className="space-y-3">
              {/* Match status */}
              <div className="flex items-center gap-2">
                <Badge variant={result.matched ? "default" : "destructive"}>
                  {result.matched ? t("pages.debug.matched") : t("pages.debug.notMatched")}
                </Badge>
                {result.error && (
                  <span className="text-sm text-destructive">{result.error}</span>
                )}
              </div>

              {/* Groups */}
              {result.groups && result.groups.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("pages.debug.regex.groups")}</Label>
                  <div className="rounded-md border bg-muted/50 p-3">
                    {result.groups.map((g, i) => (
                      <div key={`g-${i}`} className="font-mono text-sm">
                        <span className="text-muted-foreground">${i}: </span>
                        <span>{g}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Named groups */}
              {result.named_groups && Object.keys(result.named_groups).length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("pages.debug.regex.namedGroups")}</Label>
                  <div className="rounded-md border bg-muted/50 p-3">
                    {Object.entries(result.named_groups).map(([k, v]) => (
                      <div key={k} className="font-mono text-sm">
                        <span className="text-muted-foreground">{k}: </span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw JSON */}
              <div className="space-y-1">
                <Label className="text-xs">{t("pages.debug.rawJson")}</Label>
                <pre className="rounded-md border bg-muted/50 p-3 text-xs font-mono overflow-auto max-h-48">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export { DebugPage };
