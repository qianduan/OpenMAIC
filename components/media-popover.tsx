"use client";

import { useState } from "react";
import {
  Image as ImageIcon,
  Video,
  Volume2,
  Mic,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/use-i18n";
import { useSettingsStore } from "@/lib/store/settings";
import { IMAGE_PROVIDERS } from "@/lib/media/image-providers";
import { VIDEO_PROVIDERS } from "@/lib/media/video-providers";
import { TTS_PROVIDERS, getTTSVoices } from "@/lib/audio/constants";
import { ASR_PROVIDERS, getASRSupportedLanguages } from "@/lib/audio/constants";
import type { ImageProviderId, VideoProviderId } from "@/lib/media/types";
import type { TTSProviderId, ASRProviderId } from "@/lib/audio/types";
import type { SettingsSection } from "@/lib/types/settings";

interface MediaPopoverProps {
  onSettingsOpen: (section: SettingsSection) => void;
}

// ─── Provider icon maps (IMAGE/VIDEO don't have built-in icons) ───
const IMAGE_PROVIDER_ICONS: Record<string, string> = {
  seedream: "/logos/doubao.svg",
  "qwen-image": "/logos/bailian.svg",
  "nano-banana": "/logos/gemini.svg",
};
const VIDEO_PROVIDER_ICONS: Record<string, string> = {
  seedance: "/logos/doubao.svg",
  kling: "/logos/kling.svg",
  veo: "/logos/gemini.svg",
  sora: "/logos/openai.svg",
};

// ─── Color themes per capability ───
const STYLES = {
  image: {
    icon: ImageIcon,
    accent: "border-l-blue-500 dark:border-l-blue-400",
    enabledBg: "bg-blue-50/60 dark:bg-blue-950/30",
    iconBg: "bg-blue-500/10 dark:bg-blue-400/15",
    iconColor: "text-blue-600 dark:text-blue-400",
    chipBg: "bg-blue-100 dark:bg-blue-900/40",
    chipText: "text-blue-700 dark:text-blue-300",
    chipRing: "ring-1 ring-blue-300 dark:ring-blue-600/60",
  },
  video: {
    icon: Video,
    accent: "border-l-purple-500 dark:border-l-purple-400",
    enabledBg: "bg-purple-50/60 dark:bg-purple-950/30",
    iconBg: "bg-purple-500/10 dark:bg-purple-400/15",
    iconColor: "text-purple-600 dark:text-purple-400",
    chipBg: "bg-purple-100 dark:bg-purple-900/40",
    chipText: "text-purple-700 dark:text-purple-300",
    chipRing: "ring-1 ring-purple-300 dark:ring-purple-600/60",
  },
  tts: {
    icon: Volume2,
    accent: "border-l-emerald-500 dark:border-l-emerald-400",
    enabledBg: "bg-emerald-50/60 dark:bg-emerald-950/30",
    iconBg: "bg-emerald-500/10 dark:bg-emerald-400/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    chipBg: "bg-emerald-100 dark:bg-emerald-900/40",
    chipText: "text-emerald-700 dark:text-emerald-300",
    chipRing: "ring-1 ring-emerald-300 dark:ring-emerald-600/60",
  },
  asr: {
    icon: Mic,
    accent: "border-l-amber-500 dark:border-l-amber-400",
    enabledBg: "bg-amber-50/60 dark:bg-amber-950/30",
    iconBg: "bg-amber-500/10 dark:bg-amber-400/15",
    iconColor: "text-amber-600 dark:text-amber-400",
    chipBg: "bg-amber-100 dark:bg-amber-900/40",
    chipText: "text-amber-700 dark:text-amber-300",
    chipRing: "ring-1 ring-amber-300 dark:ring-amber-600/60",
  },
} as const;

export function MediaPopover({ onSettingsOpen }: MediaPopoverProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // ─── Store ───
  const imageGenerationEnabled = useSettingsStore((s) => s.imageGenerationEnabled);
  const videoGenerationEnabled = useSettingsStore((s) => s.videoGenerationEnabled);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const asrEnabled = useSettingsStore((s) => s.asrEnabled);
  const setImageGenerationEnabled = useSettingsStore((s) => s.setImageGenerationEnabled);
  const setVideoGenerationEnabled = useSettingsStore((s) => s.setVideoGenerationEnabled);
  const setTTSEnabled = useSettingsStore((s) => s.setTTSEnabled);
  const setASREnabled = useSettingsStore((s) => s.setASREnabled);

  const imageProviderId = useSettingsStore((s) => s.imageProviderId);
  const imageModelId = useSettingsStore((s) => s.imageModelId);
  const imageProvidersConfig = useSettingsStore((s) => s.imageProvidersConfig);
  const setImageProvider = useSettingsStore((s) => s.setImageProvider);
  const setImageModelId = useSettingsStore((s) => s.setImageModelId);

  const videoProviderId = useSettingsStore((s) => s.videoProviderId);
  const videoModelId = useSettingsStore((s) => s.videoModelId);
  const videoProvidersConfig = useSettingsStore((s) => s.videoProvidersConfig);
  const setVideoProvider = useSettingsStore((s) => s.setVideoProvider);
  const setVideoModelId = useSettingsStore((s) => s.setVideoModelId);

  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsSpeed = useSettingsStore((s) => s.ttsSpeed);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const setTTSProvider = useSettingsStore((s) => s.setTTSProvider);
  const setTTSVoice = useSettingsStore((s) => s.setTTSVoice);
  const setTTSSpeed = useSettingsStore((s) => s.setTTSSpeed);

  const asrProviderId = useSettingsStore((s) => s.asrProviderId);
  const asrLanguage = useSettingsStore((s) => s.asrLanguage);
  const asrProvidersConfig = useSettingsStore((s) => s.asrProvidersConfig);
  const setASRProvider = useSettingsStore((s) => s.setASRProvider);
  const setASRLanguage = useSettingsStore((s) => s.setASRLanguage);

  const enabledCount = [imageGenerationEnabled, videoGenerationEnabled, ttsEnabled, asrEnabled].filter(Boolean).length;

  const cfgOk = (
    configs: Record<string, { apiKey?: string; isServerConfigured?: boolean }>,
    id: string,
    needsKey: boolean
  ) => !needsKey || !!configs[id]?.apiKey || !!configs[id]?.isServerConfigured;

  const handleImageProviderChange = (pid: ImageProviderId) => {
    setImageProvider(pid);
    const p = IMAGE_PROVIDERS[pid];
    if (p?.models?.length) setImageModelId(p.models[0].id);
  };
  const handleVideoProviderChange = (pid: VideoProviderId) => {
    setVideoProvider(pid);
    const p = VIDEO_PROVIDERS[pid];
    if (p?.models?.length) setVideoModelId(p.models[0].id);
  };
  const handleTTSProviderChange = (pid: TTSProviderId) => {
    setTTSProvider(pid);
    const voices = getTTSVoices(pid);
    if (voices.length) setTTSVoice(voices[0].id);
  };
  const handleASRProviderChange = (pid: ASRProviderId) => {
    setASRProvider(pid);
    const langs = getASRSupportedLanguages(pid);
    if (langs.length) setASRLanguage(langs[0]);
  };

  const ttsSpeedRange = TTS_PROVIDERS[ttsProviderId]?.speedRange;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap border",
            enabledCount > 0
              ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-600 shadow-sm"
              : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 border-border"
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          {imageGenerationEnabled && <ImageIcon className="size-3 opacity-70" />}
          {videoGenerationEnabled && <Video className="size-3 opacity-70" />}
          {ttsEnabled && <Volume2 className="size-3 opacity-70" />}
          {asrEnabled && <Mic className="size-3 opacity-70" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" avoidCollisions={false} className="w-[400px] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-2.5">
        <div className="space-y-1.5">
          {/* ── Image ── */}
          <Card
            theme={STYLES.image}
            label={t("media.imageCapability")}
            hint={t("media.imageHint")}
            enabled={imageGenerationEnabled}
            onToggle={setImageGenerationEnabled}
          >
            <ProviderChips
              providers={Object.values(IMAGE_PROVIDERS).map((p) => ({
                id: p.id,
                name: p.name,
                icon: IMAGE_PROVIDER_ICONS[p.id],
                available: cfgOk(imageProvidersConfig, p.id, p.requiresApiKey),
              }))}
              selectedId={imageProviderId}
              onSelect={(id) => handleImageProviderChange(id as ImageProviderId)}
              theme={STYLES.image}
            />
            <CompactSelect
              value={imageModelId}
              onValueChange={setImageModelId}
              options={[
                ...(IMAGE_PROVIDERS[imageProviderId]?.models || []),
                ...(imageProvidersConfig[imageProviderId]?.customModels || []),
              ].map((m) => ({
                value: m.id, label: m.name,
              }))}
              icon={IMAGE_PROVIDER_ICONS[imageProviderId]}
            />
          </Card>

          {/* ── Video ── */}
          <Card
            theme={STYLES.video}
            label={t("media.videoCapability")}
            hint={t("media.videoHint")}
            enabled={videoGenerationEnabled}
            onToggle={setVideoGenerationEnabled}
          >
            <ProviderChips
              providers={Object.values(VIDEO_PROVIDERS).map((p) => ({
                id: p.id,
                name: p.name,
                icon: VIDEO_PROVIDER_ICONS[p.id],
                available: cfgOk(videoProvidersConfig, p.id, p.requiresApiKey),
              }))}
              selectedId={videoProviderId}
              onSelect={(id) => handleVideoProviderChange(id as VideoProviderId)}
              theme={STYLES.video}
            />
            <CompactSelect
              value={videoModelId}
              onValueChange={setVideoModelId}
              options={[
                ...(VIDEO_PROVIDERS[videoProviderId]?.models || []),
                ...(videoProvidersConfig[videoProviderId]?.customModels || []),
              ].map((m) => ({
                value: m.id, label: m.name,
              }))}
              icon={VIDEO_PROVIDER_ICONS[videoProviderId]}
            />
          </Card>

          {/* ── TTS ── */}
          <Card
            theme={STYLES.tts}
            label={t("media.ttsCapability")}
            hint={t("media.ttsHint")}
            enabled={ttsEnabled}
            onToggle={setTTSEnabled}
          >
            <ProviderChips
              providers={Object.values(TTS_PROVIDERS).map((p) => ({
                id: p.id,
                name: p.name,
                icon: p.icon,
                available: cfgOk(ttsProvidersConfig, p.id, p.requiresApiKey),
              }))}
              selectedId={ttsProviderId}
              onSelect={(id) => handleTTSProviderChange(id as TTSProviderId)}
              theme={STYLES.tts}
            />
            <CompactSelect
              label={t("media.voice")}
              value={ttsVoice}
              onValueChange={setTTSVoice}
              options={getTTSVoices(ttsProviderId).map((v) => ({
                value: v.id, label: v.name,
              }))}
              icon={TTS_PROVIDERS[ttsProviderId]?.icon}
            />
            {ttsSpeedRange && (
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  {t("media.speed")}
                </span>
                <Slider
                  value={[ttsSpeed]}
                  onValueChange={(value) => setTTSSpeed(value[0])}
                  min={ttsSpeedRange.min}
                  max={ttsSpeedRange.max}
                  step={0.1}
                  className="flex-1"
                />
                <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                  {ttsSpeed.toFixed(1)}x
                </span>
              </div>
            )}
          </Card>

          {/* ── ASR ── */}
          <Card
            theme={STYLES.asr}
            label={t("media.asrCapability")}
            hint={t("media.asrHint")}
            enabled={asrEnabled}
            onToggle={setASREnabled}
          >
            <ProviderChips
              providers={Object.values(ASR_PROVIDERS).map((p) => ({
                id: p.id,
                name: p.name,
                icon: p.icon,
                available: cfgOk(asrProvidersConfig, p.id, p.requiresApiKey),
              }))}
              selectedId={asrProviderId}
              onSelect={(id) => handleASRProviderChange(id as ASRProviderId)}
              theme={STYLES.asr}
            />
            <CompactSelect
              label={t("media.language")}
              value={asrLanguage}
              onValueChange={setASRLanguage}
              options={getASRSupportedLanguages(asrProviderId).map((l) => ({
                value: l, label: l,
              }))}
              icon={ASR_PROVIDERS[asrProviderId]?.icon}
            />
          </Card>
        </div>

        {/* ── Advanced Settings ── */}
        <button
          onClick={() => {
            setOpen(false);
            const section = imageGenerationEnabled ? "image"
              : videoGenerationEnabled ? "video"
              : ttsEnabled ? "tts" : "asr";
            onSettingsOpen(section);
          }}
          className="w-full flex items-center justify-between text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-2 pt-2 border-t border-border/30"
        >
          <span>{t("toolbar.advancedSettings")}</span>
          <ChevronRight className="size-3" />
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Card: left-accent container per capability ───
function Card({
  theme,
  label,
  hint,
  enabled,
  onToggle,
  children,
}: {
  theme: (typeof STYLES)[keyof typeof STYLES];
  label: string;
  hint?: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const Icon = theme.icon;
  return (
    <div
      className={cn(
        "rounded-lg border-l-[3px] transition-all",
        enabled
          ? `${theme.accent} ${theme.enabledBg}`
          : "border-l-transparent"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
            enabled ? theme.iconBg : "bg-muted"
          )}
        >
          <Icon
            className={cn(
              "h-3.5 w-3.5 transition-colors",
              enabled ? theme.iconColor : "text-muted-foreground"
            )}
          />
        </div>
        <span
          className={cn(
            "flex-1 text-[13px] font-medium transition-colors",
            !enabled && "text-muted-foreground"
          )}
        >
          {label}
          {hint && (
            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/60">
              {hint}
            </span>
          )}
        </span>
        <Switch checked={enabled} onCheckedChange={onToggle} className="scale-[0.85] origin-right" />
      </div>

      {/* Content — provider chips + model/voice selects */}
      {enabled && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── ProviderChips: horizontal logo chips for provider selection ───
function ProviderChips({
  providers,
  selectedId,
  onSelect,
  theme,
}: {
  providers: Array<{ id: string; name: string; icon?: string; available: boolean }>;
  selectedId: string;
  onSelect: (id: string) => void;
  theme: (typeof STYLES)[keyof typeof STYLES];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {providers.map((p) => {
        const selected = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => p.available && onSelect(p.id)}
            disabled={!p.available}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium transition-all",
              selected
                ? `${theme.chipBg} ${theme.chipText} ${theme.chipRing} shadow-sm`
                : p.available
                  ? "bg-muted/60 text-foreground/80 hover:bg-muted ring-1 ring-border/50 hover:ring-border"
                  : "bg-muted/30 text-muted-foreground/40 cursor-not-allowed ring-1 ring-border/20"
            )}
          >
            {p.icon && (
              <img
                src={p.icon}
                alt=""
                className={cn("size-3.5 rounded-sm", !p.available && "opacity-40")}
              />
            )}
            <span className="max-w-[100px] truncate">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── CompactSelect: logo-embedded model/voice/language selector ───
function CompactSelect({
  value,
  onValueChange,
  options,
  icon,
  label,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  icon?: string;
  label?: string;
}) {
  return (
    <div className={label ? "space-y-1" : undefined}>
      {label && (
        <span className="text-[10px] text-muted-foreground font-medium pl-0.5">
          {label}
        </span>
      )}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
        className={cn(
          "h-7 w-full rounded-lg border border-border/50 bg-muted/50 hover:bg-muted/70 shadow-none text-[11px] focus:ring-1 focus:ring-ring/30",
          icon ? "pl-2 pr-2.5" : "px-2.5"
        )}
      >
        <span className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          {icon && <img src={icon} alt="" className="size-3.5 rounded-sm shrink-0" />}
          <span className="truncate">
            <SelectValue />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    </div>
  );
}
