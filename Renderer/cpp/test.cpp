// g++ test.cpp DomElement.cpp

#include "DomElement.h"
#include "json.hpp"

#include <string>

std::string CalloutBlock_Render(const std::string& id, const nlohmann::json& properties, const std::string& content) {
    // [Virtual DOM Context Initialization]
    DomElement* contentElement = new DomElement("div");
    contentElement->setAttribute("class", "block-content");
    contentElement->setDataset("id", id);
    contentElement->setDataset("type", "callout");
    DomElement* iconElement = nullptr; // Class member mapping
    if (!(!contentElement->children.empty())) {
        iconElement = new DomElement("div");
        iconElement->setAttribute("class", "callout-icon");
        DomElement* childrenContainer = new DomElement("div");
        childrenContainer->setAttribute("class", "callout-content-wrapper block-children-container");
        contentElement->appendChild(iconElement);
        contentElement->appendChild(childrenContainer);
    }
    nlohmann::json p = properties;
    if (iconElement) {
        iconElement->textContent = (p.value("icon", "") != "" ? p.value("icon", "") : "💡");
        iconElement->setStyle("font-size", (p.value("iconSize", "") != "" ? p.value("iconSize", "") : "1.2em"));
    }
    auto flexDirection = (p.value("layout", "") != "" ? p.value("layout", "") : "row");
    auto alignItems = ((flexDirection == "column") ? "flex-start" : "flex-start");
    contentElement->setStyle("display", "flex");
    contentElement->setStyle("flex-direction", flexDirection);
    contentElement->setStyle("align-items", alignItems);
    contentElement->setStyle("gap", "8px");

    // [Final Assembly]
    std::string finalHtml = "";
    finalHtml += CreateBlockWrapper(id, contentElement->toHTML());

    // [Custom CSS Injection]
    if (properties.contains("customCSS")) {
        //finalHtml += GenerateCustomCSSStyleTag(properties["customCSS"]);
    }

    delete contentElement;
    return finalHtml;
}

int main() {
	
    std::string html = CalloutBlock_Render("f20120a9-ec2a-463b-a541-136d65b1054a", {
        {"icon", "🚀"},
        {"iconSize", "2em"},
        {"layout", "row"},
        {"customCSS", ".block-container { border: 2px solid red; }"}
		}, "This is a callout block content.");
	printf("%s\n", html.c_str());
	return 0;
}