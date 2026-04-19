#pragma once
#include <string>
#include <map>
#include <vector>

class DomElement {
public:
    std::string tagName;
    std::map<std::string, std::string> attributes;
    std::map<std::string, std::string> dataset;
    std::map<std::string, std::string> styles;

    DomElement* parent;
    std::vector<DomElement*> children;
    std::string textContent; // For basic text nodes if needed

    DomElement(const std::string& tag);
    ~DomElement();

    void setAttribute(const std::string& key, const std::string& value);
    std::string getAttribute(const std::string& key) const;

    void setDataset(const std::string& key, const std::string& value);
    std::string getDataset(const std::string& key) const;

    void setStyle(const std::string& key, const std::string& value);
    std::string getStyle(const std::string& key) const;

    void appendChild(DomElement* child);
    void removeChild(DomElement* child);
    void removeFromParent();

    std::string toHTML() const;
};