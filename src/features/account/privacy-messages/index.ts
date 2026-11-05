import type { Locale } from "@/features/i18n/locales";
import { en, type PrivacyMessages } from "./en";
import { fr } from "./fr";
import { de } from "./de";
import { es } from "./es";
import { pt } from "./pt";
import { pl } from "./pl";
import { ru } from "./ru";
import { uk } from "./uk";
import { be } from "./be";
import { it } from "./it";

export const PRIVACY_MESSAGES: Record<Locale, PrivacyMessages> = { en, fr, de, es, pt, pl, ru, uk, be, it };
