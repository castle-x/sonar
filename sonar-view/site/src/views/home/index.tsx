import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Rocket01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/shared/shadcn/button";
import appMeta from "../../../app.json";

// ═══════════════════════════════════════════════════════════════════════════════
// SayHello API Example
// ═══════════════════════════════════════════════════════════════════════════════

function SayHelloCard() {
  const { t } = useTranslation("dashboard");
  const [name, setName] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSayHello = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      // Simulated API call — replace with actual RPC client
      await new Promise((resolve) => setTimeout(resolve, 800));
      setResponse(`Hello, ${name.trim()}! 👋`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-xl border bg-card p-6 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <HugeiconsIcon icon={Rocket01Icon} className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">{t("pages.home.sayHello.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("pages.home.sayHello.description")}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSayHello()}
          placeholder={t("pages.home.sayHello.placeholder")}
          className="h-8 flex-1 rounded-lg border bg-background px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Button size="sm" onClick={handleSayHello} disabled={loading || !name.trim()}>
          {loading ? (
            t("pages.home.sayHello.loading")
          ) : (
            <>
              {t("pages.home.sayHello.send")}
              <HugeiconsIcon icon={ArrowRight01Icon} className="ml-1 size-4" />
            </>
          )}
        </Button>
      </div>

      {response && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm"
        >
          {response}
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Home Page
// ═══════════════════════════════════════════════════════════════════════════════

function HomePage() {
  const { t } = useTranslation("dashboard");

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("pages.home.title")}</h1>
        <p className="text-muted-foreground">{t("pages.home.description", { name: appMeta.displayName })}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SayHelloCard />
      </div>
    </div>
  );
}

export { HomePage };
