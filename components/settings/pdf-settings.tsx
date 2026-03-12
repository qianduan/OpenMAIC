"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/use-i18n";
import { useSettingsStore } from "@/lib/store/settings";
import { PDF_PROVIDERS } from "@/lib/pdf/constants";
import type { PDFProviderId } from "@/lib/pdf/types";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";

/**
 * Get display label for feature
 */
function getFeatureLabel(feature: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    text: t("settings.featureText"),
    images: t("settings.featureImages"),
    tables: t("settings.featureTables"),
    formulas: t("settings.featureFormulas"),
    "layout-analysis": t("settings.featureLayoutAnalysis"),
    metadata: t("settings.featureMetadata"),
  };
  return labels[feature] || feature;
}

interface PDFSettingsProps {
  selectedProviderId: PDFProviderId;
}

export function PDFSettings({ selectedProviderId }: PDFSettingsProps) {
  const { t } = useI18n();
  const [showApiKey, setShowApiKey] = useState(false);

  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const setPDFProviderConfig = useSettingsStore((state) => state.setPDFProviderConfig);

  const pdfProvider = PDF_PROVIDERS[selectedProviderId];
  const isServerConfigured = !!pdfProvidersConfig[selectedProviderId]?.isServerConfigured;

  // Reset showApiKey when provider changes (derived state pattern)
  const [prevSelectedProviderId, setPrevSelectedProviderId] = useState(selectedProviderId);
  if (selectedProviderId !== prevSelectedProviderId) {
    setPrevSelectedProviderId(selectedProviderId);
    setShowApiKey(false);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Server-configured notice */}
      {isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t("settings.serverConfiguredNotice")}
        </div>
      )}

      {/* API Key + Base URL Configuration */}
      {(pdfProvider.requiresApiKey || isServerConfigured) && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">{t("settings.pdfApiKey")}</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  placeholder={isServerConfigured ? t("settings.optionalOverride") : t("settings.enterApiKey")}
                  value={pdfProvidersConfig[selectedProviderId]?.apiKey || ""}
                  onChange={(e) =>
                    setPDFProviderConfig(selectedProviderId, { apiKey: e.target.value })
                  }
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{t("settings.pdfBaseUrl")}</Label>
              <Input
                placeholder="http://localhost:8080"
                value={pdfProvidersConfig[selectedProviderId]?.baseUrl || ""}
                onChange={(e) =>
                  setPDFProviderConfig(selectedProviderId, { baseUrl: e.target.value })
                }
                className="text-sm"
              />
            </div>
          </div>

          {/* Request URL Preview */}
          {(() => {
            const effectiveBaseUrl = pdfProvidersConfig[selectedProviderId]?.baseUrl || "";
            if (!effectiveBaseUrl) return null;
            const fullUrl = effectiveBaseUrl + "/file_parse";
            return (
              <p className="text-xs text-muted-foreground break-all">
                {t("settings.requestUrl")}: {fullUrl}
              </p>
            );
          })()}
        </>
      )}

      {/* Features List */}
      <div className="space-y-2">
        <Label className="text-sm">{t("settings.pdfFeatures")}</Label>
        <div className="flex flex-wrap gap-2">
          {pdfProvider.features.map((feature) => (
            <Badge
              key={feature}
              variant="secondary"
              className="font-normal"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {getFeatureLabel(feature, t)}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
