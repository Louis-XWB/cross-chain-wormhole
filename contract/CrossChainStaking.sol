// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// 借贷代币接口
interface ILoanToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

/**
 * @title CrossChainStaking
 * @dev 跨链质押合约，接收跨链资产并铸造借贷代币
 */
contract CrossChainStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // 状态变量
    IERC20 public stakingToken;    // 质押代币（跨链资产）
    ILoanToken public loanToken;   // 借贷代币
    uint256 public loanRatio;      // 借贷比率（10 = 10倍）
    
    // 用户质押信息
    struct StakeInfo {
        uint256 stakedAmount;      // 质押数量
        uint256 loanedAmount;      // 借贷数量
    }
    
    // 用户地址 => 质押信息
    mapping(address => StakeInfo) public stakes;
    
    // 总质押量
    uint256 public totalStaked;
    
    // 事件
    event Staked(address indexed user, uint256 amount, uint256 loanedAmount);
    event Unstaked(address indexed user, uint256 amount, uint256 burnedAmount);
    event LoanRatioUpdated(uint256 oldRatio, uint256 newRatio);
    event StakingTokenUpdated(address oldToken, address newToken);
    event LoanTokenUpdated(address oldToken, address newToken);
    
    /**
     * @dev 构造函数
     * @param _stakingToken 质押代币地址（跨链资产）
     * @param _loanToken 借贷代币地址
     * @param _loanRatio 借贷比率
     * @param initialOwner 初始所有者地址
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
     * @dev 质押代币并获取借贷代币
     * @param amount 质押数量
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        
        // 转移质押代币到合约
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // 计算借贷数量
        uint256 loanAmount = amount * loanRatio;
        
        // 更新用户质押信息
        stakes[msg.sender].stakedAmount += amount;
        stakes[msg.sender].loanedAmount += loanAmount;
        
        // 更新总质押量
        totalStaked += amount;
        
        // 铸造借贷代币
        loanToken.mint(msg.sender, loanAmount);
        
        emit Staked(msg.sender, amount, loanAmount);
    }
    
    /**
     * @dev 取回质押代币并销毁借贷代币
     * @param amount 取回数量
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(stakes[msg.sender].stakedAmount >= amount, "Insufficient staked amount");
        
        // 计算需要销毁的借贷代币数量
        uint256 burnAmount = (amount * stakes[msg.sender].loanedAmount) / stakes[msg.sender].stakedAmount;
        require(burnAmount > 0, "Burn amount too small");
        
        // 更新用户质押信息
        stakes[msg.sender].stakedAmount -= amount;
        stakes[msg.sender].loanedAmount -= burnAmount;
        
        // 更新总质押量
        totalStaked -= amount;
        
        // 销毁借贷代币
        loanToken.burn(msg.sender, burnAmount);
        
        // 转移质押代币回用户
        stakingToken.safeTransfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, amount, burnAmount);
    }
    
    /**
     * @dev 直接接收跨链资产并为用户质押（可由跨链桥调用）
     * @param user 用户地址
     * @param amount 质押数量
     */
    function stakeForUser(address user, uint256 amount) external nonReentrant {
        require(user != address(0), "Invalid user address");
        require(amount > 0, "Amount must be positive");
        
        // 转移质押代币到合约
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // 计算借贷数量
        uint256 loanAmount = amount * loanRatio;
        
        // 更新用户质押信息
        stakes[user].stakedAmount += amount;
        stakes[user].loanedAmount += loanAmount;
        
        // 更新总质押量
        totalStaked += amount;
        
        // 铸造借贷代币
        loanToken.mint(user, loanAmount);
        
        emit Staked(user, amount, loanAmount);
    }
    
    /**
     * @dev 更新借贷比率
     * @param newRatio 新的借贷比率
     */
    function updateLoanRatio(uint256 newRatio) external onlyOwner {
        require(newRatio > 0, "Loan ratio must be positive");
        uint256 oldRatio = loanRatio;
        loanRatio = newRatio;
        emit LoanRatioUpdated(oldRatio, newRatio);
    }
    
    /**
     * @dev 更新质押代币地址
     * @param newToken 新的质押代币地址
     */
    function updateStakingToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Invalid token address");
        require(totalStaked == 0, "Cannot change token while funds are staked");
        
        address oldToken = address(stakingToken);
        stakingToken = IERC20(newToken);
        emit StakingTokenUpdated(oldToken, newToken);
    }
    
    /**
     * @dev 更新借贷代币地址
     * @param newToken 新的借贷代币地址
     */
    function updateLoanToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Invalid token address");
        require(totalStaked == 0, "Cannot change token while funds are staked");
        
        address oldToken = address(loanToken);
        loanToken = ILoanToken(newToken);
        emit LoanTokenUpdated(oldToken, newToken);
    }
    
    /**
     * @dev 获取用户质押信息
     * @param user 用户地址
     * @return stakedAmount 质押数量
     * @return loanedAmount 借贷数量
     */
    function getUserStake(address user) external view returns (uint256 stakedAmount, uint256 loanedAmount) {
        return (stakes[user].stakedAmount, stakes[user].loanedAmount);
    }
    
    /**
     * @dev 紧急提款（仅限所有者，用于紧急情况）
     * @param token 代币地址
     * @param amount 提款数量
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}