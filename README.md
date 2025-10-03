# VeritNote

## A Notion-like software that fully supports localization and can render in native HTML and CSS stylesheets!

## Create cool things like this :

![](./cover.png)

## How to use

Download VeritNote.exe from [Release Assets](https://github.com/VeritNet/VeritNote/releases) . It's usually above 1MB and no installation required.


## Dev

Setting up the development environment requires a C++ toolchain and a Node.js environment for processing web assets before compilation.

### Prerequisites

1.  **C++ Toolchain**:
    *   **CMake**: Version 3.15 or newer.
    *   **A C++17 Compiler**: Visual Studio 2019 or newer is highly recommended and is the primary tested environment. MinGW has not been tested.

2.  **Node.js Environment**:
    *   **Node.js & npm**: Required to run the JavaScript minifier. You can download it from the [official Node.js website](https://nodejs.org/).
    *   **UglifyJS**: The JavaScript minifier used to compress the web UI's code during the build process. After installing Node.js, install UglifyJS globally by running this command in your terminal (CMD, PowerShell, etc.):
      ```bash
      npm install -g uglify-js
      ```

### Building the Project

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/VeritNet/VeritNote.git
    cd VeritNote
    ```

2.  **Extract Vendor Libraries**
    Unzip the `vendor.7z` archive in the project's root directory. After extraction, you should have a `vendor/` folder alongside the `src/` folder.

3.  **Configure Build System with CMake**
    The easiest way is to use Visual Studio's "Open a local folder" feature, which will automatically detect `CMakeLists.txt` and `CMakePresets.json` and configure the project.

    Alternatively, you can use the command line:
    ```bash
    # Configure the project using the x64-release preset
    cmake -S . -B build --preset x64-release
    ```

4.  **Build the Executable**
    If you are using Visual Studio, simply build the project from the IDE.

    For the command line:
    ```bash
    # Compile the project
    cmake --build build
    ```
    The final executable `VeritNote.exe` will be located in the `build/` directory.

> **Note on JavaScript Minifier Path:** The build script will try to automatically find the installed `uglify-js` script. If it fails with an error like "UglifyJS script not found", you can specify the path manually by creating a `CMakeUserPresets.json` file in the project root with the following content (adjust the path to your actual installation):
>
> ```json
> {
>   "version": 3,
>   "configurePresets": [
>     {
>       "name": "windows-base-user",
>       "hidden": true,
>       "inherits": "windows-base",
>       "cacheVariables": {
>         "VERITNOTE_UGLIFYJS_SCRIPT_PATH": "C:/Users/YourUser/AppData/Roaming/npm/node_modules/uglify-js/bin/uglifyjs"
>       }
>     },
>     { "name": "x64-debug", "inherits": "windows-base-user" },
>     { "name": "x64-release", "inherits": "windows-base-user" }
>   ]
> }
> ```
> This file should be added to your `.gitignore` and not be committed to the repository.


## Dependencies

This project uses the following third-party libraries:

* [**nlohmann/json**](https://github.com/nlohmann/json): Licensed under the **MIT License**.
* [**WIL**](https://github.com/microsoft/wil): Licensed under the **MIT License**.
* [**WebView2 SDK**](https://developer.microsoft.com/en-us/microsoft-edge/webview2)
* [**highlight.js**](https://github.com/highlightjs/highlight.js): Licensed under the **BSD 3-Clause License**

Copyright(c) 2025 the respective authors
All rights reserved.
