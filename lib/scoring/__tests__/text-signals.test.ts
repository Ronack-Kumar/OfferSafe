import { describe, expect, it } from "vitest";
import { detectNoInterview, detectPaymentRequest, detectUrgency, quoteAround } from "../text-signals";

describe("detectUrgency", () => {
  it.each([
    ["Pay the fee within 24 hours to confirm.", "within 24 hours"],
    ["Reply within 48 hrs or lose the offer.", "within 48 hrs"],
    ["This offer is valid today only.", "today only"],
    ["Join immediately and start earning.", "immediately"],
    ["Otherwise your seat will be cancelled.", "seat will be cancelled"],
    ["Your seat will be given to another candidate.", "seat will be given to"],
    ["Your offer will be revoked if you don't pay.", "offer will be revoked"],
    ["Limited seats available!", "Limited seats"],
    ["URGENT hiring for freshers", "URGENT"],
    // Hinglish
    ["24 ghante ke andar payment karo.", "24 ghante ke andar"],
    ["Fees aaj hi jama karni hogi.", "aaj hi"],
    ["Warna aapki seat cancel ho jayegi.", "seat cancel ho"],
    ["Offer cancel ho jayega agar payment nahi kiya.", "Offer cancel ho"],
    ["Turant joining karo.", "Turant"],
    ["Jaldi karo, sirf 5 seats bachi hain.", "Jaldi karo"],
  ])("finds urgency in %j", (text, phrase) => {
    expect(detectUrgency(text)?.phrase).toBe(phrase);
  });

  it.each([
    "Your date of joining is 15 January 2027.",
    "We are looking for immediate joiners with React experience.",
    "Please accept the offer on the candidate portal at your convenience.",
  ])("ignores normal offer wording: %j", (text) => {
    expect(detectUrgency(text)).toBeNull();
  });
});

describe("detectNoInterview", () => {
  it.each([
    ["No interview needed, you can start Monday.", "No interview needed"],
    ["No interview required for this role.", "No interview required"],
    ["You are directly selected for the internship.", "directly selected"],
    ["Direct selection for top candidates.", "Direct selection"],
    ["You have been selected without interview.", "without interview"],
    ["Hiring without any test or interview.", "without any test"],
    ["There is no need of interview.", "no need of interview"],
    // Hinglish
    ["Interview ki zarurat nahi hai.", "Interview ki zarurat nahi"],
    ["Interview nahi hoga, seedha joining.", "Interview nahi hoga"],
    ["Bina interview ke selection ho gaya.", "Bina interview"],
    ["Aapka seedha selection hua hai.", "seedha selection"],
  ])("finds %j", (text, phrase) => {
    expect(detectNoInterview(text)?.phrase).toBe(phrase);
  });

  it.each([
    "Further to your interview on 3 March, we are pleased to offer you the role.",
    "You will have a technical interview next week.",
    "The selection process includes an aptitude test.",
  ])("ignores %j", (text) => {
    expect(detectNoInterview(text)).toBeNull();
  });
});

describe("detectPaymentRequest", () => {
  it.each([
    ["To confirm, pay the refundable registration fee of Rs 1,999.", "pay the refundable registration fee"],
    ["Pay Rs 500 to receive your offer letter.", "Pay Rs 5"],
    ["A security deposit of ₹2000 is required.", "security deposit"],
    ["You must purchase a laptop from our vendor.", "purchase a laptop"],
    ["UPI: hr.jobs@okaxis", "UPI"],
    ["Fees bhejo aur joining letter lo.", "Fees bhejo"],
    ["Payment ke baad joining letter milega.", "Payment ke baad"],
  ])("finds a request for money in %j", (text, phrase) => {
    expect(detectPaymentRequest(text)?.phrase.startsWith(phrase)).toBe(true);
  });

  it.each([
    "Infosys does not charge any fee at any stage of recruitment.",
    "We never ask candidates for a registration fee.",
    "There is no security deposit or training fee.",
    "Your annual pay will be Rs 3,60,000.",
    "You will join as a Software Engineer.",
    "Salary will be paid on the last working day of each month.",
  ])("does not flag %j", (text) => {
    expect(detectPaymentRequest(text)).toBeNull();
  });
});

describe("quoteAround", () => {
  it("quotes the clause around the match using the user's exact words", () => {
    const text = "Congratulations! To confirm your seat, pay Rs 1,999 within 24 hours. Thanks.";
    const start = text.indexOf("within 24 hours");
    expect(quoteAround(text, start, start + "within 24 hours".length)).toBe("To confirm your seat, pay Rs 1,999 within 24 hours");
  });

  it("marks a quote that was cut from a longer sentence", () => {
    const text = `${"word ".repeat(40)}within 24 hours ${"more ".repeat(40)}`;
    const start = text.indexOf("within");
    const quote = quoteAround(text, start, start + 15);
    expect(quote.startsWith("…")).toBe(true);
    expect(quote.endsWith("…")).toBe(true);
    expect(quote).toContain("within 24 hours");
  });
});
