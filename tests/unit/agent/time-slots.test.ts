import { describe, expect, it } from "vitest";
import { phraseToSlots } from "@/features/agent/server/time-slots";

describe("phraseToSlots", () => {
  it.each([
    ["Thursday evenings", ["thu_eve"]],
    ["thursday nights", ["thu_eve"]],
    ["Thurs after work", ["thu_eve"]],
    ["weekends", ["sat_day", "sat_eve", "sun_day", "sun_eve"]],
    ["weekend mornings", ["sat_day", "sun_day"]],
    ["Saturday afternoon", ["sat_day"]],
    ["sunday evening", ["sun_eve"]],
    ["Friday night", ["fri_eve"]],
    ["weeknights", ["mon_eve", "tue_eve", "wed_eve", "thu_eve", "fri_eve"]],
    ["Mon and Wed evenings", ["mon_eve", "wed_eve"]],
    ["Tuesdays", ["tue_eve"]],
    ["Saturdays", ["sat_day", "sat_eve"]],
  ])("maps %j", (phrase, expected) => {
    expect(phraseToSlots(phrase)).toEqual(expected);
  });

  it("returns nothing for phrases with no day", () => {
    expect(phraseToSlots("whenever I'm free")).toEqual([]);
    expect(phraseToSlots("I like pottery")).toEqual([]);
  });

  it("returns slots in canonical order without duplicates", () => {
    expect(phraseToSlots("sunday evening and thursday evening and thursday night")).toEqual([
      "thu_eve",
      "sun_eve",
    ]);
  });
});
