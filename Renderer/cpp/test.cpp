// g++ test.cpp DomElement.cpp

#include "DomElement.h"
#include "json.hpp"
#include <windows.h>

#include <string>

DomElement* RenderBlockRegistry(const nlohmann::json& blockData);

// Generated C++ code for BulletedListItemBlock
DomElement* BulletedListItemBlock_Render(const nlohmann::json& blockData) {
    std::string id = blockData.value("id", "");
    nlohmann::json properties = blockData.contains("properties") ? blockData["properties"] : nlohmann::json::object();
    std::string content = blockData.value("content", "");
    // [Virtual DOM Context Initialization]
    DomElement* contentElement = new DomElement("div");
    contentElement->setAttribute("class", "block-content");
    contentElement->setDataset("id", id);
    contentElement->setDataset("type", "bulletedListItem");
    DomElement* childrenContainer = nullptr;
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
    childrenContainer = new DomElement("div");
    childrenContainer->setAttribute("class", "list-item-children-container block-children-container");
    wrapper->appendChild(textElement);
    wrapper->appendChild(childrenContainer);
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

    // [Recursive Children Rendering]
    if (childrenContainer != nullptr && blockData.contains("children") && blockData["children"].is_array()) {
        for (const auto& childData : blockData["children"]) {
            DomElement* childEl = RenderBlockRegistry(childData);
            if (childEl) {
                childrenContainer->appendChild(childEl);
            }
        }
    }

    // [Custom CSS Injection]
    if (properties.contains("customCSS")) {
        DomElement* styleTag = new DomElement("style");
        //styleTag->???properties["customCSS"];
        contentElement->appendChild(styleTag);
    }

    // [Final Assembly]
    return CreateBlockWrapper(id, contentElement);
}

// Generated C++ code for CalloutBlock
DomElement* CalloutBlock_Render(const nlohmann::json& blockData) {
    std::string id = blockData.value("id", "");
    nlohmann::json properties = blockData.contains("properties") ? blockData["properties"] : nlohmann::json::object();
    std::string content = blockData.value("content", "");
    // [Virtual DOM Context Initialization]
    DomElement* contentElement = new DomElement("div");
    contentElement->setAttribute("class", "block-content");
    contentElement->setDataset("id", id);
    contentElement->setDataset("type", "callout");
    DomElement* childrenContainer = nullptr;
    DomElement* iconElement = nullptr; // Class member mapping
    if (!(!contentElement->children.empty())) {
    iconElement = new DomElement("div");
    iconElement->setAttribute("class", "callout-icon");
    childrenContainer = new DomElement("div");
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

    // [Recursive Children Rendering]
    if (childrenContainer != nullptr && blockData.contains("children") && blockData["children"].is_array()) {
        for (const auto& childData : blockData["children"]) {
            DomElement* childEl = RenderBlockRegistry(childData);
            if (childEl) {
                childrenContainer->appendChild(childEl);
            }
        }
    }

    // [Custom CSS Injection]
    if (properties.contains("customCSS")) {
        DomElement* styleTag = new DomElement("style");
        //styleTag->???properties["customCSS"];
        contentElement->appendChild(styleTag);
    }

    // [Final Assembly]
    return CreateBlockWrapper(id, contentElement);
}

// Block Type Registry Router
DomElement* RenderBlockRegistry(const nlohmann::json& blockData) {
    std::string type = blockData.value("type", "");
    if (type == "bulletedListItem") {
        return BulletedListItemBlock_Render(blockData);
    }
    else if (type == "callout") {
        return CalloutBlock_Render(blockData);
    }
    return nullptr; // Unknown type
}

int main() {
    SetConsoleOutputCP(65001);
	DomElement* root = RenderBlockRegistry(nlohmann::json::parse(R"(

        {
        "children": [
          {
            "children": [],
            "content": "1<span style=\"color: rgb(255, 0, 0);\">2</span><b>3</b>",
            "id": "2b731b6f-4ef8-479c-9e9a-e9838f723b1b",
            "properties": {
              "customCSS": [
                {
                  "rules": [
                    {
                      "prop": "",
                      "val": ""
                    }
                  ],
                  "selector": ""
                }
              ]
            },
            "type": "bulletedListItem"
          }
        ],
        "content": "",
        "id": "06e005e2-39c9-44bc-aeda-d967fc7803b5",
        "properties": {
          "customCSS": [
            {
              "rules": [
                {
                  "prop": "",
                  "val": ""
                }
              ],
              "selector": ""
            }
          ]
        },
        "type": "callout"
      }

    )"));

    printf("%s", root->toHTML().c_str());
	return 0;
}