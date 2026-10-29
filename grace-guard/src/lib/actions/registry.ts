import { deleteDailyActivity, deleteLead, saveDailyActivity, saveLead } from "./activity";
import { importCsv } from "./import";
import { deleteApplication, deleteExpense, deleteTransaction, saveApplication, saveExpense, saveTransaction } from "./production";
import {
  addScheduleException,
  deleteAssumption,
  deleteCarrier,
  deleteDialingSession,
  deleteGoal,
  deleteScheduleException,
  saveAssumption,
  saveBaseline,
  saveCampaign,
  saveCarrier,
  saveDialingSession,
  saveForecastAssumptions,
  saveGoal,
  saveLeadSource,
  saveProduct,
  saveProfile,
  saveSchedule,
} from "./settings";

/**
 * Client components look server actions up by name instead of receiving
 * them as props from server components, so every form binds the action
 * reference directly from its module (the pattern Next.js handles most reliably).
 */
export const ACTIONS = {
  saveDailyActivity,
  deleteDailyActivity,
  saveLead,
  deleteLead,
  importCsv,
  saveApplication,
  deleteApplication,
  saveTransaction,
  deleteTransaction,
  saveExpense,
  deleteExpense,
  addScheduleException,
  deleteScheduleException,
  saveAssumption,
  deleteAssumption,
  saveBaseline,
  saveCampaign,
  saveCarrier,
  deleteCarrier,
  saveDialingSession,
  deleteDialingSession,
  saveForecastAssumptions,
  saveGoal,
  deleteGoal,
  saveLeadSource,
  saveProduct,
  saveProfile,
  saveSchedule,
} as const;

export type ActionName = keyof typeof ACTIONS;
