#include "DomElement.h"
#include <sstream>

std::string CreateBlockWrapper(const std::string& id, const std::string& innerHtml) {
    return "<div class=\"block-container\" data-id=\"" + id + "\" draggable=\"true\">"
        "<div class=\"block-controls\">"
        "<span class=\"drag-handle\" title=\"Drag to move\">⠿</span>"
        "</div>" +
        innerHtml +
        "</div>";
}



DomElement::DomElement(const std::string& tag) : tagName(tag), parent(nullptr) {}

DomElement::~DomElement() {
    for (auto child : children) {
        delete child;
    }
}

void DomElement::setAttribute(const std::string& key, const std::string& value) { attributes[key] = value; }
std::string DomElement::getAttribute(const std::string& key) const {
    auto it = attributes.find(key);
    return it != attributes.end() ? it->second : "";
}

void DomElement::setDataset(const std::string& key, const std::string& value) { dataset[key] = value; }
std::string DomElement::getDataset(const std::string& key) const {
    auto it = dataset.find(key);
    return it != dataset.end() ? it->second : "";
}

void DomElement::setStyle(const std::string& key, const std::string& value) { styles[key] = value; }
std::string DomElement::getStyle(const std::string& key) const {
    auto it = styles.find(key);
    return it != styles.end() ? it->second : "";
}

void DomElement::appendChild(DomElement* child) {
    if (child->parent) {
        child->removeFromParent();
    }
    child->parent = this;
    children.push_back(child);
}

void DomElement::removeChild(DomElement* child) {
    for (auto it = children.begin(); it != children.end(); ++it) {
        if (*it == child) {
            child->parent = nullptr;
            children.erase(it);
            break;
        }
    }
}

void DomElement::removeFromParent() {
    if (parent) {
        parent->removeChild(this);
    }
}

std::string DomElement::toHTML() const {
    std::ostringstream oss;
    oss << "<" << tagName;

    // Build standard attributes
    for (const auto& attr : attributes) {
        oss << " " << attr.first << "=\"" << attr.second << "\"";
    }

    // Build dataset (data-*)
    for (const auto& data : dataset) {
        oss << " data-" << data.first << "=\"" << data.second << "\"";
    }

    // Build inline styles
    if (!styles.empty()) {
        oss << " style=\"";
        for (const auto& style : styles) {
            oss << style.first << ":" << style.second << ";";
        }
        oss << "\"";
    }

    oss << ">";

    // Self-closing tags logic could be added here if needed (e.g., img, br, input)
    if (tagName == "input" || tagName == "img" || tagName == "br") {
        return oss.str();
    }

    oss << textContent;
    for (const auto& child : children) {
        oss << child->toHTML();
    }

    oss << "</" << tagName << ">";
    return oss.str();
}