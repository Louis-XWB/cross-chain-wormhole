// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LoanToken
 * @dev LoanToken is a token that allows authorized addresses to mint and burn tokens
 */
contract LoanToken is ERC20, Ownable {
    // mapping of authorized minters
    mapping(address => bool) public minters;
    
    // Event
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    
    /**
     * @dev Constructor
     * @param name The name of the token
     * @param symbol The symbol of the token
     * @param initialOwner The initial owner of the token
     */
    constructor(
        string memory name, 
        string memory symbol,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {}
    
    /**
     * @dev Add minter permission
     * @param minter The minter address
     */
    function addMinter(address minter) external onlyOwner {
        require(minter != address(0), "Invalid minter address");
        minters[minter] = true;
        emit MinterAdded(minter);
    }
    
    /**
     * @dev Remove minter permission
     * @param minter The minter address
     */
    function removeMinter(address minter) external onlyOwner {
        require(minters[minter], "Not a minter");
        minters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev Mint tokens
     * @param to The recipient address
     * @param amount The amount to mint
     */
    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "Caller is not a minter");
        _mint(to, amount);
    }
    
    /**
     * @dev Burn tokens
     * @param from The source address
     * @param amount The amount to burn
     */
    function burn(address from, uint256 amount) external {
        require(minters[msg.sender], "Caller is not a minter");
        _burn(from, amount);
    }
}