import type { Locale } from "../locales";
import { de } from "./de";
import { en, type Messages } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { pl } from "./pl";
import { pt } from "./pt";
import { ru } from "./ru";

export const MESSAGES: Record<Locale, Messages> = { en, fr, de, es, pt, pl, ru, it };
