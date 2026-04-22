// g++ test.cpp DomElement.cpp

#include "DomElement.h"
#include "json.hpp"
#include <windows.h>

#include <string>

std::string BulletedListItemBlock_Render(const std::string& id, const nlohmann::json& properties, const std::string& content) {
    // [Virtual DOM Context Initialization]
    DomElement* contentElement = new DomElement("div");
    contentElement->setAttribute("class", "block-content");
    contentElement->setDataset("id", id);
    contentElement->setDataset("type", "bulletedListItem");
    DomElement* textElement = nullptr; // Class member mapping
    if (!(!contentElement->children.empty())) {
    DomElement* bullet = new DomElement("div");
    bullet->setAttribute("class", "bullet-point");
    bullet->textContent = "•";
    DomElement* wrapper = new DomElement("div");
    wrapper->setAttribute("class", "list-item-content-wrapper");
    textElement = new DomElement("div");
    textElement->setAttribute("class", "list-item-text-area");
    textElement->setAttribute("contentEditable", "true");
    textElement->textContent = (content != "" ? content : "");
    textElement->setDataset("placeholder", "List item");
    //childrenContainer = new DomElement("div");
    //childrenContainer->setAttribute("class", "list-item-children-container block-children-container");
    wrapper->appendChild(textElement);
    //wrapper->appendChild(childrenContainer);
    contentElement->appendChild(bullet);
    contentElement->appendChild(wrapper);
    }
    // [Call Custom Method: _applyListItemStyles]
    {
        auto a = 1;
    auto b = a;
    nlohmann::json p = properties;
    // [Call Custom Method: applyTextStyles]
    {
        // [Alias mapped] s -> contentElement.style

    nlohmann::json p = properties;
    if (p.contains("color")) {
    contentElement->setStyle("color", p.value("color", ""));
    }
    if (p.contains("textAlign")) {
    contentElement->setStyle("text-align", p.value("textAlign", ""));
    }
    if (p.contains("fontSize")) {
    contentElement->setStyle("font-size", p.value("fontSize", ""));
    }
    if (p.contains("fontWeight")) {
    contentElement->setStyle("font-weight", p.value("fontWeight", ""));
    }
    if (p.contains("lineHeight")) {
    contentElement->setStyle("line-height", p.value("lineHeight", ""));
    }
    if (p.contains("letterSpacing")) {
    contentElement->setStyle("letter-spacing", p.value("letterSpacing", ""));
    }
    if (p.contains("textDecoration")) {
    contentElement->setStyle("text-decoration", p.value("textDecoration", ""));
    }
    if (p.contains("fontFamily")) {
    if ((p.value("fontFamily", "") != "inherit")) {
    contentElement->setStyle("font-family", p.value("fontFamily", ""));
    }
    }
    }
    if (p.contains("textDecoration")) {
    if (textElement) {
    textElement->setStyle("text-decoration", p.value("textDecoration", ""));
    }
    }
    }

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
    SetConsoleOutputCP(65001);
	
    /*std::string html = CalloutBlock_Render("b45799db-d344-46b0-b04d-ffb280fa139c", {
        {"icon", "🚀"},
        {"iconSize", "2em"},
        {"layout", "row"},
        {"customCSS", ".block-container { border: 2px solid red; }"}
		}, "This is a callout block content.");*/
    
    std::string html = BulletedListItemBlock_Render("b018f5ba-56c2-42b5-aae6-bb4875d272d5", {
        {"color", "blue"},
        {"textAlign", "center"},
        {"fontSize", "16px"},
        {"fontWeight", "bold"},
        {"lineHeight", "1.5"},
        {"letterSpacing", "0.5px"},
        {"textDecoration", "underline"},
        {"fontFamily", "Arial, sans-serif"}
    }, "123");
    printf("%s\n", html.c_str());
	return 0;
}