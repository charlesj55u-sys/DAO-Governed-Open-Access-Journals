import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PROPOSAL_DURATION = 101;
const ERR_INVALID_QUORUM_THRESHOLD = 102;
const ERR_INVALID_MAJORITY_THRESHOLD = 103;
const ERR_INVALID_PROPOSAL_TYPE = 104;
const ERR_PROPOSAL_ALREADY_EXISTS = 105;
const ERR_PROPOSAL_NOT_FOUND = 106;
const ERR_VOTING_CLOSED = 107;
const ERR_INSUFFICIENT_TOKENS = 108;
const ERR_ALREADY_VOTED = 109;
const ERR_PROPOSAL_NOT_ACTIVE = 110;
const ERR_EXECUTION_FAILED = 111;
const ERR_INVALID_TIMELOCK = 112;
const ERR_PROPOSAL_EXPIRED = 113;
const ERR_INVALID_TARGET_CONTRACT = 114;
const ERR_INVALID_PARAM = 115;
const ERR_MAX_PROPOSALS_EXCEEDED = 116;
const ERR_INVALID_START_DELAY = 117;
const ERR_INVALID_VOTE_WEIGHT = 118;
const ERR_NOT_TOKEN_HOLDER = 119;
const ERR_INVALID_DESCRIPTION_LENGTH = 120;

interface Proposal {
  creator: string;
  startBlock: number;
  endBlock: number;
  proposalType: string;
  targetContract: string | null;
  functionName: string | null;
  param: Buffer | null;
  description: string;
  forVotes: number;
  againstVotes: number;
  executed: boolean;
  timelockEnd: number;
}

interface Vote {
  weight: number;
  votedFor: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class GovernanceContractMock {
  state: {
    nextProposalId: number;
    maxProposals: number;
    proposalDuration: number;
    quorumThreshold: number;
    majorityThreshold: number;
    timelockDuration: number;
    tokenContract: string;
    treasuryContract: string | null;
    proposals: Map<number, Proposal>;
    votes: Map<string, Vote>;
    proposalCountByType: Map<string, number>;
  } = {
    nextProposalId: 0,
    maxProposals: 1000,
    proposalDuration: 144,
    quorumThreshold: 10,
    majorityThreshold: 51,
    timelockDuration: 72,
    tokenContract: "SP000000000000000000002Q6VF78",
    treasuryContract: null,
    proposals: new Map(),
    votes: new Map(),
    proposalCountByType: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  tokenBalances: Map<string, number> = new Map([["ST1TEST", 10000]]);
  totalTokenSupply: number = 100000;
  contractCalls: Array<{ target: string; fname: string; param: Buffer }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextProposalId: 0,
      maxProposals: 1000,
      proposalDuration: 144,
      quorumThreshold: 10,
      majorityThreshold: 51,
      timelockDuration: 72,
      tokenContract: "SP000000000000000000002Q6VF78",
      treasuryContract: null,
      proposals: new Map(),
      votes: new Map(),
      proposalCountByType: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.tokenBalances = new Map([["ST1TEST", 10000]]);
    this.totalTokenSupply = 100000;
    this.contractCalls = [];
  }

  getBalance(principal: string): Result<number> {
    const balance = this.tokenBalances.get(principal) ?? 0;
    return { ok: true, value: balance };
  }

  getTotalSupply(): Result<number> {
    return { ok: true, value: this.totalTokenSupply };
  }

  setProposalDuration(newDuration: number): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: false };
    if (newDuration <= 0 || newDuration > 1008) return { ok: false, value: false };
    this.state.proposalDuration = newDuration;
    return { ok: true, value: true };
  }

  setQuorumThreshold(newThreshold: number): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: false };
    if (newThreshold < 5 || newThreshold > 50) return { ok: false, value: false };
    this.state.quorumThreshold = newThreshold;
    return { ok: true, value: true };
  }

  setMajorityThreshold(newThreshold: number): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: false };
    if (newThreshold <= 50 || newThreshold > 100) return { ok: false, value: false };
    this.state.majorityThreshold = newThreshold;
    return { ok: true, value: true };
  }

  setTimelockDuration(newDuration: number): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: false };
    if (newDuration < 24 || newDuration > 720) return { ok: false, value: false };
    this.state.timelockDuration = newDuration;
    return { ok: true, value: true };
  }

  createProposal(
    ptype: string,
    target: string | null,
    fname: string | null,
    param: Buffer | null,
    desc: string,
    startDelay: number
  ): Result<number> {
    if (this.state.nextProposalId >= this.state.maxProposals) return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    if (!["policy", "upgrade", "fund", "journal"].includes(ptype)) return { ok: false, value: ERR_INVALID_PROPOSAL_TYPE };
    if (target && target === this.caller) return { ok: false, value: ERR_INVALID_TARGET_CONTRACT };
    if (param && param.length > 1024) return { ok: false, value: ERR_INVALID_PARAM };
    if (!desc || desc.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION_LENGTH };
    if (startDelay > 144) return { ok: false, value: ERR_INVALID_START_DELAY };
    const minTokens = this.totalTokenSupply / 100;
    if ((this.tokenBalances.get(this.caller) ?? 0) < minTokens) return { ok: false, value: ERR_INSUFFICIENT_TOKENS };

    const startBlock = this.blockHeight + startDelay;
    const endBlock = startBlock + this.state.proposalDuration;
    const id = this.state.nextProposalId;
    const proposal: Proposal = {
      creator: this.caller,
      startBlock,
      endBlock,
      proposalType: ptype,
      targetContract: target,
      functionName: fname,
      param,
      description: desc,
      forVotes: 0,
      againstVotes: 0,
      executed: false,
      timelockEnd: 0,
    };
    this.state.proposals.set(id, proposal);
    this.state.proposalCountByType.set(ptype, (this.state.proposalCountByType.get(ptype) ?? 0) + 1);
    this.state.nextProposalId++;
    return { ok: true, value: id };
  }

  voteOnProposal(id: number, voteFor: boolean): Result<boolean> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: false };
    if (this.blockHeight < proposal.startBlock) return { ok: false, value: false };
    if (this.blockHeight >= proposal.endBlock) return { ok: false, value: false };
    const voteKey = `${id}-${this.caller}`;
    if (this.state.votes.has(voteKey)) return { ok: false, value: false };
    const balance = this.tokenBalances.get(this.caller) ?? 0;
    if (balance <= 0) return { ok: false, value: false };
    const weight = Math.floor(Math.sqrt(balance) / 100);
    this.state.votes.set(voteKey, { weight, votedFor: voteFor });
    if (voteFor) {
      proposal.forVotes += weight;
    } else {
      proposal.againstVotes += weight;
    }
    return { ok: true, value: true };
  }

  executeProposal(id: number): Result<boolean> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: false };
    if (this.blockHeight < proposal.endBlock) return { ok: false, value: false };
    if (proposal.executed) return { ok: false, value: false };
    const totalVotes = proposal.forVotes + proposal.againstVotes;
    const quorum = (this.totalTokenSupply * this.state.quorumThreshold) / 100;
    if (totalVotes < quorum) return { ok: false, value: false };
    const majority = (proposal.forVotes * 100) / totalVotes;
    if (majority < this.state.majorityThreshold) return { ok: false, value: false };
    const timelockEnd = proposal.endBlock + this.state.timelockDuration;
    if (this.blockHeight < timelockEnd) {
      proposal.timelockEnd = timelockEnd;
      return { ok: true, value: false };
    }
    if (!proposal.targetContract || !proposal.functionName) return { ok: false, value: false };
    this.contractCalls.push({ target: proposal.targetContract, fname: proposal.functionName, param: proposal.param ?? Buffer.from([]) });
    proposal.executed = true;
    return { ok: true, value: true };
  }

  getProposal(id: number): Proposal | null {
    return this.state.proposals.get(id) ?? null;
  }

  getVote(id: number, voter: string): Vote | null {
    return this.state.votes.get(`${id}-${voter}`) ?? null;
  }

  getProposalCountByType(ptype: string): number {
    return this.state.proposalCountByType.get(ptype) ?? 0;
  }
}

describe("GovernanceContract", () => {
  let contract: GovernanceContractMock;

  beforeEach(() => {
    contract = new GovernanceContractMock();
    contract.reset();
  });

  it("creates a proposal successfully", () => {
    const result = contract.createProposal("policy", "ST2TARGET", "update", Buffer.from("param"), "Test proposal", 10);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const proposal = contract.getProposal(0);
    expect(proposal?.proposalType).toBe("policy");
    expect(proposal?.description).toBe("Test proposal");
    expect(contract.getProposalCountByType("policy")).toBe(1);
  });

  it("rejects invalid proposal type", () => {
    const result = contract.createProposal("invalid", null, null, null, "Invalid", 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSAL_TYPE);
  });

  it("rejects insufficient tokens for proposal creation", () => {
    contract.tokenBalances.set("ST1TEST", 0);
    const result = contract.createProposal("policy", null, null, null, "Low balance", 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_TOKENS);
  });

  it("votes on proposal successfully", () => {
    contract.createProposal("policy", null, null, null, "Vote test", 0);
    contract.blockHeight = 1;
    const result = contract.voteOnProposal(0, true);
    expect(result.ok).toBe(true);
    const proposal = contract.getProposal(0);
    expect(proposal?.forVotes).toBeGreaterThan(0);
    const vote = contract.getVote(0, "ST1TEST");
    expect(vote?.votedFor).toBe(true);
  });

  it("rejects vote on inactive proposal", () => {
    contract.createProposal("policy", null, null, null, "Inactive", 10);
    const result = contract.voteOnProposal(0, true);
    expect(result.ok).toBe(false);
  });

  it("rejects double vote", () => {
    contract.createProposal("policy", null, null, null, "Double vote", 0);
    contract.voteOnProposal(0, true);
    const result = contract.voteOnProposal(0, false);
    expect(result.ok).toBe(false);
  });

  it("rejects execution before voting closed", () => {
    contract.createProposal("policy", null, null, null, "Early exec", 0);
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
  });

  it("rejects execution without quorum", () => {
    contract.createProposal("policy", null, null, null, "No quorum", 0);
    contract.blockHeight = 145;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
  });

  it("sets proposal duration successfully", () => {
    const result = contract.setProposalDuration(200);
    expect(result.ok).toBe(true);
    expect(contract.state.proposalDuration).toBe(200);
  });

  it("rejects invalid proposal duration", () => {
    const result = contract.setProposalDuration(0);
    expect(result.ok).toBe(false);
  });

  it("rejects setting by unauthorized", () => {
    contract.caller = "ST2FAKE";
    const result = contract.setQuorumThreshold(15);
    expect(result.ok).toBe(false);
  });

  it("uses Clarity types for parameters", () => {
    const id = uintCV(1);
    expect(id.value).toEqual(BigInt(1));
  });
});