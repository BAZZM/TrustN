import React from "react";
import "./DialContactScreen.css";

/**
 * Top toolbar for the dial screen: search only.
 * Section can be extended (e.g. view hints, sort) without touching the wheel.
 */
export default function DialToolbar({ searchValue, onSearchChange, searchPlaceholder, id = "dial-search" }) {
  return (
    <section className="dial-section dial-toolbar" aria-label="Dial search">
      <input
        type="search"
        id={id}
        name="dialSearch"
        className="dial-toolbar__search"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Search contacts by name or occupation"
      />
    </section>
  );
}
