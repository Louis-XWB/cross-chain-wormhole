// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LoanToken
 * @dev 借贷代币合约，实现ERC-20标准，允许授权地址铸造和销毁代币
 */
contract LoanToken is ERC20, Ownable {
    // 授权铸造者映射
    mapping(address => bool) public minters;
    
    // 事件
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    
    /**
     * @dev 构造函数，设置代币名称和符号
     * @param name 代币名称
     * @param symbol 代币符号
     * @param initialOwner 初始所有者地址
     */
    constructor(
        string memory name, 
        string memory symbol,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {}
    
    /**
     * @dev 添加铸造者权限
     * @param minter 铸造者地址
     */
    function addMinter(address minter) external onlyOwner {
        require(minter != address(0), "Invalid minter address");
        minters[minter] = true;
        emit MinterAdded(minter);
    }
    
    /**
     * @dev 移除铸造者权限
     * @param minter 铸造者地址
     */
    function removeMinter(address minter) external onlyOwner {
        require(minters[minter], "Not a minter");
        minters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev 铸造代币
     * @param to 接收者地址
     * @param amount 铸造数量
     */
    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "Caller is not a minter");
        _mint(to, amount);
    }
    
    /**
     * @dev 销毁代币
     * @param from 销毁来源地址
     * @param amount 销毁数量
     */
    function burn(address from, uint256 amount) external {
        require(minters[msg.sender], "Caller is not a minter");
        _burn(from, amount);
    }
}