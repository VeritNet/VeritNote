# VeritNote

## A Notion-like software that fully supports localization and can render in native HTML and CSS stylesheets!

## Create cool things like this :

![](./cover.png)

## How to use

Download VeritNote.exe from [Release Assets](https://github.com/VeritNet/VeritNote/releases) . It's usually above 1MB and no installation required.

## Dev

1. Download this repo
2. unzip 'vendor.7z'
You will get:
| - src/
| - vendor/
| - webview_ui/
| - CMakeLists.txt
3. Use CMake + MSVC to build, no more steps required (Visual Studio is recommended & Haven't tested MinGW)

In the future, it will provide support for other platforms, but currently the backend still relies on Webview2

## Dependencies

This project uses the following third-party libraries:

* [**nlohmann/json**](https://github.com/nlohmann/json): Licensed under the **MIT License**.
* [**WIL**](https://github.com/microsoft/wil): Licensed under the **MIT License**.
* [**WebView2 SDK**](https://developer.microsoft.com/en-us/microsoft-edge/webview2)
* [**highlight.js**](https://github.com/highlightjs/highlight.js): Licensed under the **BSD 3-Clause License**

Copyright(c) 2025 the respective authors
All rights reserved.
