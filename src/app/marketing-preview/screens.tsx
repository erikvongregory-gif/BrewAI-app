"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BrewAiAdminShell, useStudioShell } from "@/components/dashboard-shell/brewai-admin-shell";
import { AdminHomeView } from "@/components/dashboard/admin-home-view";
import { AdminPricingView } from "@/components/dashboard/admin-pricing-view";
import { AdminSettingsView } from "@/components/dashboard/admin-settings-view";
import { AdminTeamView } from "@/components/dashboard/admin-team-view";
import { BrandProfileView } from "@/components/dashboard/BrandProfileView";
import { HopfenHugoChat } from "@/components/studio/hopfen-hugo-chat";
import { StudioMediaLibrary } from "@/components/studio/media/studio-media-library";
import { CreateVideosView } from "@/components/studio/create-videos-view";
import { InhalteErstellenStudio } from "@/components/ui/inhalte-erstellen-studio";
import {
  ADMIN_SETTINGS,
  BRAND_COMPLETE,
  BRAND_EMPTY,
  BREWERY,
  CHAT_MESSAGES,
  DASHBOARD_MEDIA,
  EMAIL,
  LIBRARY_MEDIA,
  PROFILE,
  SETTINGS_COMPLETE,
  SETTINGS_INCOMPLETE,
  SUMMARY_EMPTY,
  SUMMARY_FULL,
  TEAM_MEMBERS,
  type MarketingScreenId,
} from "./fixtures";

function FullBleedOn() {
  const { setFullBleed, setContentPadding } = useStudioShell();
  useEffect(() => {
    setFullBleed(true);
    setContentPadding("0");
    return () => {
      setFullBleed(false);
      setContentPadding(undefined);
    };
  }, [setFullBleed, setContentPadding]);
  return null;
}

function ScreenBody({ screen }: { screen: MarketingScreenId }) {
  const [team, setTeam] = useState(TEAM_MEMBERS);
  const [media, setMedia] = useState(LIBRARY_MEDIA);
  const [settings, setSettings] = useState(ADMIN_SETTINGS);
  const [brand, setBrand] = useState(BRAND_COMPLETE);
  const [chatInput, setChatInput] = useState("");

  const noop = () => undefined;
  const asyncNoop = async () => undefined;

  let body: ReactNode;
  switch (screen) {
    case "dashboard":
    case "dashboard-dark":
      body = (
        <AdminHomeView
          summary={SUMMARY_FULL}
          summaryLoaded
          media={DASHBOARD_MEDIA}
          mediaLoaded
          settings={SETTINGS_COMPLETE}
          settingsLoaded
          profileName={PROFILE}
          breweryName={BREWERY}
          brandProfileComplete
          brandProfileMode="guided"
          initialTokenRange="90d"
          onOpenTab={noop}
          onOpenBrandSetup={noop}
        />
      );
      break;
    case "dashboard-empty":
      body = (
        <AdminHomeView
          summary={SUMMARY_EMPTY}
          summaryLoaded
          media={[]}
          mediaLoaded
          settings={SETTINGS_INCOMPLETE}
          settingsLoaded
          profileName={PROFILE}
          breweryName={BREWERY}
          brandProfileComplete={false}
          brandProfileMode="undecided"
          onOpenTab={noop}
          onOpenBrandSetup={noop}
        />
      );
      break;
    case "dashboard-incomplete":
      body = (
        <AdminHomeView
          summary={SUMMARY_FULL}
          summaryLoaded
          media={DASHBOARD_MEDIA.slice(0, 3)}
          mediaLoaded
          settings={SETTINGS_INCOMPLETE}
          settingsLoaded
          profileName={PROFILE}
          breweryName={BREWERY}
          brandProfileComplete={false}
          brandProfileMode="guided"
          initialTokenRange="90d"
          onOpenTab={noop}
          onOpenBrandSetup={noop}
        />
      );
      break;
    case "assistant":
      body = (
        <>
          <FullBleedOn />
          <HopfenHugoChat
            variant="page"
            messages={CHAT_MESSAGES}
            inputValue={chatInput}
            onInputChange={setChatInput}
            onSubmit={noop}
            onNewChat={noop}
            onOpenHistory={noop}
            buddyState="idle"
          />
        </>
      );
      break;
    case "create":
      body = (
        <>
          <FullBleedOn />
          <InhalteErstellenStudio
            initialBreweryName={BREWERY}
            brandProfileComplete
            brandProfileActive
            brandProfileMode="guided"
          />
        </>
      );
      break;
    case "create-locked":
      body = (
        <>
          <FullBleedOn />
          <InhalteErstellenStudio
            initialBreweryName={BREWERY}
            brandProfileComplete={false}
            brandProfileActive={false}
            brandProfileMode="undecided"
          />
        </>
      );
      break;
    case "media":
      body = (
        <StudioMediaLibrary
          items={media}
          onItemsChange={setMedia}
          loaded
          mockDownload
          hasActivePlan
          canWriteMedia
        />
      );
      break;
    case "brand":
      body = (
        <BrandProfileView
          value={brand}
          loaded
          loadError={null}
          brandProfileComplete
          brandProfileNotice=""
          onOpenBrandSetup={noop}
          onSkipBrandProfile={noop}
          onResetBrandProfile={asyncNoop}
          onChange={(patch) => setBrand((prev) => ({ ...prev, ...patch }) as typeof prev)}
          onSave={asyncNoop}
        />
      );
      break;
    case "brand-empty":
      body = (
        <BrandProfileView
          value={BRAND_EMPTY}
          loaded
          loadError={null}
          brandProfileComplete={false}
          brandProfileNotice=""
          onOpenBrandSetup={noop}
          onSkipBrandProfile={noop}
          onResetBrandProfile={asyncNoop}
          onChange={() => undefined}
          onSave={asyncNoop}
        />
      );
      break;
    case "team":
      body = <AdminTeamView members={team} onMembersChange={setTeam} loaded myRole="owner" />;
      break;
    case "pricing":
      body = (
        <AdminPricingView
          currentPlan="pro"
          monthlyTokens={4500}
          usedTokens={1680}
          remainingTokens={2820}
        />
      );
      break;
    case "settings":
      body = (
        <AdminSettingsView
          value={settings}
          onChange={setSettings}
          loaded
          loadError={null}
          brandProfileComplete
          brandProfileNotice=""
          onOpenBrandTab={noop}
          onOpenBrandSetup={noop}
          onSkipBrandProfile={noop}
          onResetBrandProfile={asyncNoop}
        />
      );
      break;
    case "videos":
      body = <CreateVideosView breweryName={BREWERY} />;
      break;
    default:
      body = null;
  }

  return body;
}

export function MarketingScreen({ screen }: { screen: MarketingScreenId }) {
  return (
    <BrewAiAdminShell
      userEmail={EMAIL}
      initialProfileName={BREWERY}
      initialBreweryName={BREWERY}
      uiTourSeen
      defaultSidebarOpen
      sidebarVariant="sidebar"
    >
      <ScreenBody screen={screen} />
    </BrewAiAdminShell>
  );
}
