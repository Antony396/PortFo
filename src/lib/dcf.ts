export interface DCFInput {
  fcf: number;
  growthRate: number;
  discountRate: number;
  terminalGrowth: number;
  years: number;
  sharesOutstanding: number;
  cashEquivalent: number;
  totalDebt: number;
}

export interface DCFResult {
  projectedCashFlows: number[];
  lastCashFlow: number;
  discountedCashFlows: number[];
  sumPvYears: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  intrinsicValuePerShare: number;
}

export function calculateDCF(input: DCFInput): DCFResult {
  if (input.discountRate <= input.terminalGrowth) {
    throw new Error('Discount rate must be greater than terminal growth rate.');
  }

  if (input.years <= 0 || !Number.isInteger(input.years)) {
    throw new Error('Projection years must be a whole number greater than 0.');
  }

  if (input.sharesOutstanding <= 0) {
    throw new Error('Shares outstanding must be greater than 0.');
  }

  const projectedCashFlows = Array.from({ length: input.years }, (_, index) => {
    const year = index + 1;
    return input.fcf * (1 + input.growthRate) ** year;
  });

  const discountedCashFlows = projectedCashFlows.map((cashFlow, index) => {
    return cashFlow / (1 + input.discountRate) ** (index + 1);
  });

  const sumPvYears = discountedCashFlows.reduce((sum, value) => sum + value, 0);
  const lastCashFlow = projectedCashFlows[projectedCashFlows.length - 1];
  const terminalValue = (lastCashFlow * (1 + input.terminalGrowth)) / (input.discountRate - input.terminalGrowth);
  const pvTerminalValue = terminalValue / (1 + input.discountRate) ** (input.years + 1);
  const enterpriseValue = sumPvYears + pvTerminalValue;
  const equityValue = enterpriseValue + input.cashEquivalent - input.totalDebt;
  const intrinsicValuePerShare = equityValue / input.sharesOutstanding;

  return {
    projectedCashFlows,
    lastCashFlow,
    discountedCashFlows,
    sumPvYears,
    terminalValue,
    pvTerminalValue,
    enterpriseValue,
    equityValue,
    intrinsicValuePerShare,
  };
}
