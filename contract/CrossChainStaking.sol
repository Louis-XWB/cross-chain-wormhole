// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// LoanToken interface
interface ILoanToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

/**
 * @title CrossChainStaking
 * @dev Cross-chain staking contract, receives cross-chain assets and mints loan tokens
 */
contract CrossChainStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // State variables
    IERC20 public stakingToken;    // LoanToken
    ILoanToken public loanToken;   // LoanToken
    uint256 public loanRatio;      // Loan ratio (10 = 10x)
    
    // User stake information
    struct StakeInfo {
        uint256 stakedAmount;      // Staked amount
        uint256 loanedAmount;      // Loaned amount
    }
    
    // User address => stake information
    mapping(address => StakeInfo) public stakes;
    
    // Total staked amount
    uint256 public totalStaked;
    
    // Events
    event Staked(address indexed user, uint256 amount, uint256 loanedAmount);
    event Unstaked(address indexed user, uint256 amount, uint256 burnedAmount);
    event LoanRatioUpdated(uint256 oldRatio, uint256 newRatio);
    event StakingTokenUpdated(address oldToken, address newToken);
    event LoanTokenUpdated(address oldToken, address newToken);
    
    /**
     * @dev Constructor
     * @param _stakingToken The address of the staking token (cross-chain asset)
     * @param _loanToken The address of the loan token
     * @param _loanRatio The loan ratio (10 = 10x)
     * @param initialOwner The initial owner address
     */
    constructor(
        address _stakingToken,
        address _loanToken,
        uint256 _loanRatio,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_stakingToken != address(0), "Invalid staking token");
        require(_loanToken != address(0), "Invalid loan token");
        require(_loanRatio > 0, "Loan ratio must be positive");
        
        stakingToken = IERC20(_stakingToken);
        loanToken = ILoanToken(_loanToken);
        loanRatio = _loanRatio;
    }
    
    /**
     * @dev Stake tokens and get loan tokens
     * @param amount The amount to stake
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        
        // Transfer staking tokens to the contract
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Calculate the loan amount
        uint256 loanAmount = amount * loanRatio;
        
        // Update user stake information
        stakes[msg.sender].stakedAmount += amount;
        stakes[msg.sender].loanedAmount += loanAmount;
        
        // Update total staked amount
        totalStaked += amount;
        
        // Mint loan tokens
        loanToken.mint(msg.sender, loanAmount);
        
        emit Staked(msg.sender, amount, loanAmount);
    }
    
    /**
     * @dev Unstake tokens and burn loan tokens
     * @param amount The amount to unstake
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(stakes[msg.sender].stakedAmount >= amount, "Insufficient staked amount");
        
        // Calculate the amount of loan tokens to burn
        uint256 burnAmount = (amount * stakes[msg.sender].loanedAmount) / stakes[msg.sender].stakedAmount;
        require(burnAmount > 0, "Burn amount too small");
        
        // Update user stake information
        stakes[msg.sender].stakedAmount -= amount;
        stakes[msg.sender].loanedAmount -= burnAmount;
        
        // Update total staked amount
        totalStaked -= amount;
        
        // Burn loan tokens
        loanToken.burn(msg.sender, burnAmount);
        
        // Transfer staking tokens back to the user
        stakingToken.safeTransfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, amount, burnAmount);
    }
    
    /**
     * @dev Directly receive cross-chain assets and stake them for the user (can be called by the cross-chain bridge)
     * @param user User address
     * @param amount The amount to stake
     */
    function stakeForUser(address user, uint256 amount) external nonReentrant {
        require(user != address(0), "Invalid user address");
        require(amount > 0, "Amount must be positive");
        
        // Transfer staking tokens to the contract
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Calculate the loan amount
        uint256 loanAmount = amount * loanRatio;
        
        // Update user stake information
        stakes[user].stakedAmount += amount;
        stakes[user].loanedAmount += loanAmount;
        
        // Update total staked amount
        totalStaked += amount;
        
        // Mint loan tokens
        loanToken.mint(user, loanAmount);
        
        emit Staked(user, amount, loanAmount);
    }
    
    /**
     * @dev Update the loan ratio
     * @param newRatio The new loan ratio
     */
    function updateLoanRatio(uint256 newRatio) external onlyOwner {
        require(newRatio > 0, "Loan ratio must be positive");
        uint256 oldRatio = loanRatio;
        loanRatio = newRatio;
        emit LoanRatioUpdated(oldRatio, newRatio);
    }
    
    /**
     * @dev Update the staking token address
     * @param newToken The new staking token address
     */
    function updateStakingToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Invalid token address");
        require(totalStaked == 0, "Cannot change token while funds are staked");
        
        address oldToken = address(stakingToken);
        stakingToken = IERC20(newToken);
        emit StakingTokenUpdated(oldToken, newToken);
    }
    
    /**
     * @dev Update the loan token address
     * @param newToken The new loan token address
     */
    function updateLoanToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Invalid token address");
        require(totalStaked == 0, "Cannot change token while funds are staked");
        
        address oldToken = address(loanToken);
        loanToken = ILoanToken(newToken);
        emit LoanTokenUpdated(oldToken, newToken);
    }
    
    /**
     * @dev Get user stake information
     * @param user User address
     * @return stakedAmount Staked amount
     * @return loanedAmount Loaned amount
     */
    function getUserStake(address user) external view returns (uint256 stakedAmount, uint256 loanedAmount) {
        return (stakes[user].stakedAmount, stakes[user].loanedAmount);
    }
    
    /**
     * @dev Emergency withdrawal (only for the owner, for emergency situations)
     * @param token Token address
     * @param amount The amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}